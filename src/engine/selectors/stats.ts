/**
 * Derived stats (FEATURES.md §5): Entity (CharSheet + battle adjustments) and
 * Enemy formulas. Raw stat values are the modifiers; no (score-10)/2.
 */
import {
  ATTRIBUTE_COUNT,
  DEX,
  STR,
  StatusEffect,
  type Attributes6,
  type CharSheetDef,
  type DiceTiers,
  type StatusDef,
  type WeaponDef,
} from '../../assets/types.ts';
import { truncDiv } from '../math.ts';
import type { Combatant, EnemyUnit, EntityUnit } from '../types.ts';

export function statIndexOf(stat: string | null | undefined, fallback = STR): number {
  switch ((stat ?? '').toUpperCase()) {
    case 'STRENGTH':
      return 0;
    case 'DEXTERITY':
      return 1;
    case 'CONSTITUTION':
      return 2;
    case 'INTELLIGENCE':
      return 3;
    case 'WISDOM':
      return 4;
    case 'CHARISMA':
      return 5;
    default:
      return fallback;
  }
}

/** Weapon.getStatIndex: unknown strings fall back to STR. */
export const weaponStatIndex = (w: WeaponDef): number => statIndexOf(w.statType, STR);
/** Spell.statIndex: unknown strings fall back to DEX. */
export const spellStatIndex = (stat: string | null | undefined): number => statIndexOf(stat, DEX);

/** Status.sumMagnitude */
export function sumMagnitude(statuses: readonly StatusDef[], effectType: number): number {
  let total = 0;
  for (const s of statuses) if (s.effectType === effectType) total += s.magnitude;
  return total;
}
/** Status.sumMovement: MOVEMENT_MODIFIER not tied to an attribute. */
export function sumMovement(statuses: readonly StatusDef[]): number {
  let total = 0;
  for (const s of statuses)
    if (s.effectType === StatusEffect.MOVEMENT_MODIFIER && s.targetAttribute < 0) total += s.magnitude;
  return total;
}

// ---------- Entity / CharSheet ----------

/** CharSheet.getStatusAttributeModifier: STAT_MODIFIER and MOVEMENT_MODIFIER statuses targeting the attribute (F-12). */
export function statusAttributeModifier(sheet: CharSheetDef, attribute: number): number {
  let m = 0;
  for (const s of sheet.status) {
    if (
      (s.effectType === StatusEffect.STAT_MODIFIER || s.effectType === StatusEffect.MOVEMENT_MODIFIER) &&
      s.targetAttribute === attribute
    )
      m += s.magnitude;
  }
  return m;
}

/** CharSheet.updateAttributes: temp = accessories[0..2] + weapons[0] (primary only, F-29). */
export function tempAttributes(sheet: CharSheetDef): Attributes6 {
  const out: Attributes6 = [0, 0, 0, 0, 0, 0];
  const sources = [sheet.accessories[0], sheet.accessories[1], sheet.accessories[2], sheet.weapons[0]];
  for (const src of sources) {
    if (!src) continue;
    for (let i = 0; i < ATTRIBUTE_COUNT; i++) out[i] = (out[i] ?? 0) + (src.modifiedAttributes[i] ?? 0);
  }
  return out;
}

export function totalAttributes(sheet: CharSheetDef): Attributes6 {
  const temp = tempAttributes(sheet);
  const out: Attributes6 = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < ATTRIBUTE_COUNT; i++)
    out[i] = (sheet.baseAttributes[i] ?? 0) + (temp[i] ?? 0) + statusAttributeModifier(sheet, i);
  return out;
}

/** Entity.getAdjustedAttribute: total + battle-only adjustment. */
export function adjustedAttribute(e: EntityUnit, attribute: number): number {
  if (attribute < 0 || attribute >= ATTRIBUTE_COUNT) return 0;
  return (totalAttributes(e.sheet)[attribute] ?? 0) + (e.statAdjustment[attribute] ?? 0);
}

/** CharSheet.getTotalDefense */
export const totalDefense = (sheet: CharSheetDef): number =>
  sheet.accessories.reduce((s, a) => s + (a ? a.defense : 0), 0);

export const equippedWeapon = (e: EntityUnit): WeaponDef | null => e.sheet.weapons[0];

/** Entity.getAC (R5.4) */
export function entityAC(e: EntityUnit): number {
  return (
    e.sheet.armorClass +
    totalDefense(e.sheet) +
    sumMagnitude(e.sheet.status, StatusEffect.AC_MODIFIER) +
    e.acAdjustment
  );
}

/** Entity.getAttackModifier (R5.5) */
export function entityAttackModifier(e: EntityUnit): number {
  const w = equippedWeapon(e);
  const statusBonus = sumMagnitude(e.sheet.status, StatusEffect.ATTACK_MODIFIER);
  return adjustedAttribute(e, w ? weaponStatIndex(w) : STR) + statusBonus;
}

/** Entity.getMovement (R5.6): max(0, 1 + trunc((adjDEX + 1) / 2) + Σ flat MOVEMENT_MODIFIER). */
export function entityMovement(e: EntityUnit): number {
  return Math.max(0, 1 + truncDiv(adjustedAttribute(e, DEX) + 1, 2) + sumMovement(e.sheet.status));
}

export const isCaster = (sheet: CharSheetDef): boolean =>
  sheet.spellcastingStat !== null && sheet.spellcastingStat !== '';
export const castingStatIndex = (sheet: CharSheetDef): number => spellStatIndex(sheet.spellcastingStat);

/** Entity.getCastingModifier (R5.9) */
export const entityCastingModifier = (e: EntityUnit): number =>
  isCaster(e.sheet) ? adjustedAttribute(e, castingStatIndex(e.sheet)) : 0;
export const entitySpellAttackModifier = (e: EntityUnit): number =>
  entityCastingModifier(e) + sumMagnitude(e.sheet.status, StatusEffect.ATTACK_MODIFIER);
export const SPELL_DC_BASE = 10;
export const entitySpellSaveDC = (e: EntityUnit): number => SPELL_DC_BASE + entityCastingModifier(e);
export const entitySaveModifier = (e: EntityUnit, attribute: number): number =>
  adjustedAttribute(e, attribute);

/** Entity.getBaseDamageDice: unarmed d4/d4/d4 (F-30). */
export function entityBaseDamageDice(e: EntityUnit): DiceTiers {
  const w = equippedWeapon(e);
  return w ? [...w.damageDice] : ['d4', 'd4', 'd4'];
}
export function entityDamageDice(e: EntityUnit): DiceTiers {
  const base = entityBaseDamageDice(e);
  return [e.diceOverride[0] ?? base[0], e.diceOverride[1] ?? base[1], e.diceOverride[2] ?? base[2]];
}

// ---------- Enemy ----------

/** Enemy.getAC (R5.13): armorClass ≤ 0 reads as 10. */
export function enemyAC(en: EnemyUnit): number {
  const base = en.armorClass <= 0 ? 10 : en.armorClass;
  return base + en.acAdjustment + sumMagnitude(en.statuses, StatusEffect.AC_MODIFIER);
}
export const enemyAdjustedDex = (en: EnemyUnit): number => en.dexterity + en.dexAdjustment;
export const enemyAttackModifier = (en: EnemyUnit): number =>
  enemyAdjustedDex(en) + sumMagnitude(en.statuses, StatusEffect.ATTACK_MODIFIER);
export const enemyInitiative = (en: EnemyUnit): number => enemyAdjustedDex(en);
export const enemyMovement = (en: EnemyUnit): number => Math.max(0, en.mobility + sumMovement(en.statuses));

/** Enemy.getAttribute: DEX slot is the `dexterity` field; missing attributes default to dexterity. */
export function enemyAttribute(en: EnemyUnit, index: number): number {
  if (index === DEX) return en.dexterity;
  return en.attributes?.[index] ?? en.dexterity;
}
/** Enemy.getSaveModifier: base (+dex tweak for DEX) + STAT_MODIFIER statuses targeting the index. */
export function enemySaveModifier(en: EnemyUnit, index: number): number {
  const base = index === DEX ? enemyAdjustedDex(en) : enemyAttribute(en, index);
  let mod = 0;
  for (const s of en.statuses)
    if (s.effectType === StatusEffect.STAT_MODIFIER && s.targetAttribute === index) mod += s.magnitude;
  return base + mod;
}
export function enemyDamageDice(en: EnemyUnit): DiceTiers {
  return [
    en.diceOverride[0] ?? en.damageDice[0],
    en.diceOverride[1] ?? en.damageDice[1],
    en.diceOverride[2] ?? en.damageDice[2],
  ];
}

// ---------- polymorphic (CombatManager helpers) ----------

export const attackModifier = (u: Combatant): number =>
  u.kind === 'entity' ? entityAttackModifier(u) : enemyAttackModifier(u);
export const armorClass = (u: Combatant): number => (u.kind === 'entity' ? entityAC(u) : enemyAC(u));
export const damageDice = (u: Combatant): DiceTiers =>
  u.kind === 'entity' ? entityDamageDice(u) : enemyDamageDice(u);
export const baseDamageDice = (u: Combatant): DiceTiers =>
  u.kind === 'entity' ? entityBaseDamageDice(u) : [...u.damageDice];
export const movement = (u: Combatant): number =>
  u.kind === 'entity' ? entityMovement(u) : enemyMovement(u);
export const health = (u: Combatant): number => (u.kind === 'entity' ? u.sheet.currentHP : u.health);
export const maxHealth = (u: Combatant): number => (u.kind === 'entity' ? u.sheet.totalHP : u.maxHealth);
export const isDead = (u: Combatant): boolean => health(u) <= 0;
/** TurnManager.getDexterity: the initiative modifier. */
export const initiativeModifier = (u: Combatant): number =>
  u.kind === 'entity' ? adjustedAttribute(u, DEX) : enemyInitiative(u);
export const saveModifier = (u: Combatant, attribute: number): number =>
  u.kind === 'entity' ? entitySaveModifier(u, attribute) : enemySaveModifier(u, attribute);
/** CombatManager.getSpellAttackModifier / getSpellSaveDC / getCastingModifier / getCasterLevel for any caster. */
export const spellAttackModifier = (u: Combatant): number =>
  u.kind === 'entity' ? entitySpellAttackModifier(u) : attackModifier(u);
export const spellSaveDC = (u: Combatant): number =>
  u.kind === 'entity' ? entitySpellSaveDC(u) : SPELL_DC_BASE + attackModifier(u);
export const castingModifier = (u: Combatant): number =>
  u.kind === 'entity' ? entityCastingModifier(u) : attackModifier(u);
export const casterLevel = (u: Combatant): number => (u.kind === 'entity' ? Math.max(1, u.sheet.level) : 1);
/** CombatManager.getStatTypeName: "STRENGTH" for anything but an armed entity (F-9). */
export const statTypeName = (u: Combatant): string =>
  u.kind === 'entity' && u.sheet.weapons[0] ? u.sheet.weapons[0].statType : 'STRENGTH';
