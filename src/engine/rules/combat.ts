/** CombatManager + DiceRollPanel math (FEATURES.md §6). */
import type { DiceTiers, SpellDef } from '../../assets/types.ts';
import { CANTRIP_SCALING_LEVELS } from '../../assets/types.ts';
import { floorDiv } from '../math.ts';

/** margin = d20 + mod − AC (R6.2) */
export const calculateMargin = (d20: number, mod: number, targetAC: number): number => d20 + mod - targetAC;

/** 0 = miss, 1 = margin 0–4, 2 = 5–7, 3 = ≥ 8 (R6.2) */
export function attackTier(margin: number): number {
  if (margin < 0) return 0;
  if (margin <= 4) return 1;
  if (margin <= 7) return 2;
  return 3;
}

/** CombatManager.getDiceForTier: cumulative tiers, null tiers skipped; a short/null array means d4/d4/d6 (R6.3) */
export function diceForTier(
  weaponDice: readonly (string | null)[] | null | undefined,
  tier: number,
): string[] {
  const dice = !weaponDice || weaponDice.length < 3 ? ['d4', 'd4', 'd6'] : weaponDice;
  const out: string[] = [];
  if (tier >= 1 && dice[0]) out.push(dice[0]);
  if (tier >= 2 && dice[1]) out.push(dice[1]);
  if (tier >= 3 && dice[2]) out.push(dice[2]);
  return out;
}

/** DiceRollPanel: weapon flat bonus = floorDiv(attackMod + 2, 2) (R6.5) */
export const weaponDamageBonus = (attackMod: number): number => floorDiv(attackMod + 2, 2);

/** DiceRollPanel.spellBonus: (addCastingMod ? floorDiv(casting + 2, 2) : 0) + flatDamage (R6.20) */
export const spellDamageBonus = (spell: SpellDef, castingMod: number): number =>
  (spell.addCastingMod ? floorDiv(castingMod + 2, 2) : 0) + spell.flatDamage;

/**
 * DiceRollPanel.processDamageRoll total (R6.6, R6.21):
 * sum → ×1.5 ceil on a natural 20 (attack rolls only) → max(0, + bonus) when any dice → halve (int division).
 */
export function damageTotal(
  rolled: readonly number[],
  opts: { crit: boolean; bonus: number; halve: boolean },
): number {
  let total = rolled.reduce((s, v) => s + v, 0);
  if (opts.crit) total = Math.ceil(total * 1.5);
  if (rolled.length > 0) total = Math.max(0, total + opts.bonus);
  if (opts.halve) total = Math.trunc(total / 2);
  return total;
}

/** CombatManager.getSaveFailTier (R6.17): success at ≥ DC, else tier of (DC − total − 1). */
export function saveFailTier(dc: number, saveTotal: number): number {
  if (saveTotal >= dc) return 0;
  return attackTier(dc - saveTotal - 1);
}

/** CombatManager.getSpellDice (R6.19) */
export function spellDice(spell: SpellDef, tier: number, casterLevel: number, slotLevel: number): string[] {
  const dice: string[] = [];
  for (let i = 0; i < Math.min(tier, 3); i++) {
    const d = spell.damageDice[i];
    if (d) dice.push(d);
  }
  if (dice.length === 0 || tier < 1) return dice;
  if (spell.level === 0) {
    for (const lvl of CANTRIP_SCALING_LEVELS) if (casterLevel >= lvl) dice.push(dice[0] as string);
  } else if (spell.upcastDie) {
    for (let i = spell.level; i < slotLevel; i++) dice.push(spell.upcastDie);
  }
  return dice;
}

/** CombatManager.tierDieCount */
function tierDieCount(spell: SpellDef, tier: number): number {
  let n = 0;
  for (let i = 0; i < Math.min(tier, 3); i++) if (spell.damageDice[i]) n++;
  return n;
}

/** CombatManager.sumRolledForTier (R6.22): own tier dice + the shared extra dice rolled at maxTier. */
export function sumRolledForTier(
  spell: SpellDef,
  rolled: readonly number[],
  maxTier: number,
  tier: number,
): number {
  const own = tierDieCount(spell, tier);
  if (own === 0 || tier < 1) return 0;
  const shared = tierDieCount(spell, maxTier);
  let sum = 0;
  for (let i = 0; i < own && i < rolled.length; i++) sum += rolled[i] as number;
  for (let i = shared; i < rolled.length; i++) sum += rolled[i] as number;
  return sum;
}

/** Weapon.isRanged: ammoType non-empty (R6.8) */
export const isRanged = (ammoType: string | null | undefined): boolean =>
  ammoType !== null && ammoType !== undefined && ammoType !== '';

/** Ammunition.isCompatibleWith (R6.8, F-16) */
export function ammoCompatible(
  ammoType: string | null,
  legacyCompatibleWeaponType: string | null,
  weaponAmmoType: string | null,
  ignoreLegacyField: boolean,
): boolean {
  const effective = ignoreLegacyField ? ammoType : (ammoType ?? legacyCompatibleWeaponType);
  if (weaponAmmoType === null || weaponAmmoType === undefined || effective === null) return false;
  if (effective === 'Any' || weaponAmmoType === 'Any') return true;
  return effective.toLowerCase() === weaponAmmoType.toLowerCase();
}

/** Spell.isFriendly */
export const isFriendlySpell = (spell: SpellDef): boolean =>
  spell.resolution === 'HEAL' || spell.resolution === 'BUFF';
/** Spell.isArea / isSelfCenteredArea */
export const isAreaSpell = (spell: SpellDef): boolean => spell.area !== 'NONE';
export const isSelfCenteredArea = (spell: SpellDef): boolean => spell.area === 'BURST' && spell.range === 0;

/** DiceRollPanel: riders land on a hit / failed save at or above riderMinTier; friendly spells always (R6.23) */
export const riderApplies = (spell: SpellDef, tier: number, saved: boolean): boolean =>
  isFriendlySpell(spell) || (tier > 0 && !saved && tier >= spell.riderMinTier);

export type { DiceTiers };
