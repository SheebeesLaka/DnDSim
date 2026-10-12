/**
 * Named parts behind the single numbers in stats.ts, so the roll panel can show
 * "9 d20 + 7 STR + 2 Blessed" instead of "+9". Every *Parts function sums to
 * exactly its stats.ts counterpart (tests/rules/R19.breakdown.spec.ts).
 */
import { ATTRIBUTE_SHORT, StatusEffect, STR, type StatusDef } from '../../assets/types.ts';
import { floorDiv } from '../math.ts';
import type { Combatant, EnemyUnit, EntityUnit } from '../types.ts';
import {
  castingStatIndex,
  equippedWeapon,
  isCaster,
  tempAttributes,
  totalDefense,
  weaponStatIndex,
} from './stats.ts';

/** `stat` is a base attribute or gear, `status` comes from a status effect, `adjust` is a DM battle tweak. */
export interface Part {
  label: string;
  value: number;
  kind: 'stat' | 'status' | 'adjust' | 'flat';
}

export const sumParts = (parts: readonly Part[]): number => parts.reduce((s, p) => s + p.value, 0);

const statusParts = (statuses: readonly StatusDef[], keep: (s: StatusDef) => boolean): Part[] =>
  statuses
    .filter((s) => keep(s) && s.magnitude !== 0)
    .map((s) => ({ label: s.name, value: s.magnitude, kind: 'status' }));

const adjustPart = (value: number): Part[] =>
  value === 0 ? [] : [{ label: 'Adjust', value, kind: 'adjust' }];

/** adjustedAttribute(e, i) as parts: base + gear, STAT/MOVEMENT statuses on that attribute, the DM tweak. */
export function entityAttributeParts(e: EntityUnit, i: number): Part[] {
  const base = (e.sheet.baseAttributes[i] ?? 0) + (tempAttributes(e.sheet)[i] ?? 0);
  return [
    { label: ATTRIBUTE_SHORT[i] ?? '?', value: base, kind: 'stat' },
    ...statusParts(
      e.sheet.status,
      (s) =>
        (s.effectType === StatusEffect.STAT_MODIFIER || s.effectType === StatusEffect.MOVEMENT_MODIFIER) &&
        s.targetAttribute === i,
    ),
    ...adjustPart(e.statAdjustment[i] ?? 0),
  ];
}

const attackStatuses = (u: Combatant): Part[] =>
  statusParts(
    u.kind === 'entity' ? u.sheet.status : u.statuses,
    (s) => s.effectType === StatusEffect.ATTACK_MODIFIER,
  );

function enemyDexParts(en: EnemyUnit): Part[] {
  return [{ label: 'DEX', value: en.dexterity, kind: 'stat' }, ...adjustPart(en.dexAdjustment)];
}

/** attackModifier(u) as parts. */
export function attackParts(u: Combatant): Part[] {
  if (u.kind === 'enemy') return [...enemyDexParts(u), ...attackStatuses(u)];
  const w = equippedWeapon(u);
  return [...entityAttributeParts(u, w ? weaponStatIndex(w) : STR), ...attackStatuses(u)];
}

/** castingModifier(u) as parts (no attack statuses). */
export function castingParts(u: Combatant): Part[] {
  if (u.kind === 'enemy') return [...enemyDexParts(u), ...attackStatuses(u)];
  if (!isCaster(u.sheet)) return [{ label: 'not a caster', value: 0, kind: 'stat' }];
  return entityAttributeParts(u, castingStatIndex(u.sheet));
}

/** spellAttackModifier(u) as parts. */
export function spellAttackParts(u: Combatant): Part[] {
  if (u.kind === 'enemy') return attackParts(u);
  return [...castingParts(u), ...attackStatuses(u)];
}

/** spellSaveDC(u) as parts: a flat 10 plus the casting modifier (attack modifier for enemies). */
export function saveDCParts(u: Combatant): Part[] {
  return [
    { label: 'DC base', value: 10, kind: 'flat' },
    ...(u.kind === 'enemy' ? attackParts(u) : castingParts(u)),
  ];
}

/** armorClass(u) as parts. */
export function acParts(u: Combatant): Part[] {
  if (u.kind === 'enemy') {
    return [
      { label: 'AC', value: u.armorClass <= 0 ? 10 : u.armorClass, kind: 'stat' },
      ...adjustPart(u.acAdjustment),
      ...statusParts(u.statuses, (s) => s.effectType === StatusEffect.AC_MODIFIER),
    ];
  }
  const gear = totalDefense(u.sheet);
  return [
    { label: 'AC', value: u.sheet.armorClass, kind: 'stat' },
    ...(gear === 0 ? [] : [{ label: 'Gear', value: gear, kind: 'stat' as const }]),
    ...statusParts(u.sheet.status, (s) => s.effectType === StatusEffect.AC_MODIFIER),
    ...adjustPart(u.acAdjustment),
  ];
}

/** saveModifier(u, i) as parts. */
export function saveParts(u: Combatant, i: number): Part[] {
  if (u.kind === 'entity') return entityAttributeParts(u, i);
  const isDex = i === 1;
  const base: Part[] = isDex
    ? enemyDexParts(u)
    : [{ label: ATTRIBUTE_SHORT[i] ?? '?', value: u.attributes?.[i] ?? u.dexterity, kind: 'stat' }];
  return [
    ...base,
    ...statusParts(u.statuses, (s) => s.effectType === StatusEffect.STAT_MODIFIER && s.targetAttribute === i),
  ];
}

/**
 * The flat damage bonus floorDiv(mod + 2, 2) (R6.5, R6.20) split into what the
 * stat alone gives ("STR ½") and what statuses / tweaks add on top, so a Bless
 * shows as its own +1. Sums to floorDiv(sumParts(modParts) + 2, 2).
 */
export function halfBonusParts(modParts: readonly Part[]): Part[] {
  const total = floorDiv(sumParts(modParts) + 2, 2);
  const statParts = modParts.filter((p) => p.kind === 'stat' || p.kind === 'flat');
  const statLabel = statParts[0]?.label ?? 'mod';
  const fromStat = floorDiv(sumParts(statParts) + 2, 2);
  const rest = total - fromStat;
  const extras = modParts.filter((p) => p.kind === 'status' || p.kind === 'adjust');
  const parts: Part[] = [{ label: `${statLabel} ½`, value: fromStat, kind: 'stat' }];
  if (rest !== 0)
    parts.push({
      label:
        extras.length === 1 ? (extras[0] as Part).label : extras.map((p) => p.label).join(' + ') || 'other',
      value: rest,
      kind: extras.some((p) => p.kind === 'status') ? 'status' : 'adjust',
    });
  return parts;
}
