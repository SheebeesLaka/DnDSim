/**
 * The Spell Editor dialog's model (UI/SpellEditorDialog.java), kept free of the
 * DOM: form values, which rows show, the live preview line, validation and the
 * conversion back to a SpellDef.
 */
import { STATUS_EFFECT_NAMES, StatusEffect, type Die, type SpellDef } from '../assets/types.ts';
import { formatDiceList } from '../engine/dice.ts';
import { STAT_TYPES } from './defaults.ts';

export interface SpellFormValues {
  name: string;
  color: string;
  level: number;
  school: string;
  description: string;
  resolution: SpellDef['resolution'];
  targetType: SpellDef['targetType'];
  range: number;
  area: SpellDef['area'];
  areaSize: number;
  friendlyFire: boolean;
  dice: [Die, Die, Die];
  upcastDie: Die;
  flatDamage: number;
  addCastingMod: boolean;
  saveStat: string;
  onSave: 'NONE' | 'HALF';
  riderOn: boolean;
  riderName: string;
  /** StatusEffect 1..6 */
  riderEffect: number;
  riderMagnitude: number;
  riderDuration: number;
  /** attribute index 0..5 (used for STAT_MODIFIER) */
  riderAttr: number;
  riderMinTier: number;
}

export const SPINNER_RANGES = {
  level: [0, 9],
  range: [0, 30],
  areaSize: [1, 20],
  flatDamage: [-20, 50],
  riderMagnitude: [-99, 99],
  riderDuration: [-1, 99],
  riderMinTier: [1, 3],
} as const;

export const clampTo = (v: number, [lo, hi]: readonly [number, number]): number =>
  Math.max(lo, Math.min(hi, Math.trunc(v)));

/** The dialog's initial values (Java clamps each spinner's starting value into its range). */
export function spellFormFromSpell(s: SpellDef, isNew: boolean): SpellFormValues {
  const r = s.riderStatus;
  return {
    name: isNew ? '' : s.name,
    color: s.color,
    level: clampTo(s.level, SPINNER_RANGES.level),
    school: s.school,
    description: s.description,
    resolution: s.resolution,
    targetType: s.targetType,
    range: clampTo(s.range, SPINNER_RANGES.range),
    area: s.area,
    areaSize: clampTo(Math.max(1, s.areaSize), SPINNER_RANGES.areaSize),
    friendlyFire: s.friendlyFire,
    dice: [s.damageDice[0] || null, s.damageDice[1] || null, s.damageDice[2] || null],
    upcastDie: s.upcastDie || null,
    flatDamage: clampTo(s.flatDamage, SPINNER_RANGES.flatDamage),
    addCastingMod: s.addCastingMod,
    saveStat: (STAT_TYPES as readonly string[]).includes(s.saveStat) ? s.saveStat : 'DEXTERITY',
    onSave: s.onSave,
    riderOn: r !== null,
    riderName: r?.name ?? '',
    riderEffect: r && r.effectType > 0 ? r.effectType : StatusEffect.DAMAGE_OVER_TIME,
    riderMagnitude: clampTo(r?.magnitude ?? 2, SPINNER_RANGES.riderMagnitude),
    riderDuration: clampTo(r?.duration ?? 2, SPINNER_RANGES.riderDuration),
    riderAttr: r && r.targetAttribute >= 0 ? r.targetAttribute : 0,
    riderMinTier: clampTo(s.riderMinTier, SPINNER_RANGES.riderMinTier),
  };
}

/** Friendly spells default to allies, harmful ones to enemies (resolution combo listener). */
export function targetForResolution(
  current: SpellDef['targetType'],
  resolution: SpellDef['resolution'],
): SpellDef['targetType'] {
  if (resolution === 'HEAL' || resolution === 'BUFF') return current === 'ENEMY' ? 'ALLY' : current;
  return current === 'ALLY' ? 'ENEMY' : current;
}

export type SpellRow =
  | 'range'
  | 'areaSize'
  | 'friendlyFire'
  | 'saveStat'
  | 'onSave'
  | 'tier1'
  | 'tier2'
  | 'tier3'
  | 'flat'
  | 'upcast'
  | 'castingMod'
  | 'riderName'
  | 'riderEffect'
  | 'riderMagnitude'
  | 'riderDuration'
  | 'riderAttr'
  | 'riderMinTier';

/** Which rows show and how three of them are labelled (the dialog's `update` runnable). */
export function spellFormLayout(v: SpellFormValues): {
  visible: Record<SpellRow, boolean>;
  labels: { tier1: string; range: string; areaSize: string };
} {
  const isSave = v.resolution === 'SAVE';
  const isHeal = v.resolution === 'HEAL';
  const isBuff = v.resolution === 'BUFF';
  const isAuto = v.resolution === 'AUTO';
  const leveled = v.level > 0;
  const isArea = v.area !== 'NONE';
  const aimedFromCaster = v.area === 'CONE' || v.area === 'LINE';
  const rider = v.riderOn;
  return {
    visible: {
      range: !aimedFromCaster,
      areaSize: isArea,
      friendlyFire: isArea && !isHeal && !isBuff,
      saveStat: isSave,
      onSave: isSave,
      tier1: !isBuff,
      tier2: !isBuff && !isHeal,
      tier3: !isBuff && !isHeal,
      flat: !isBuff,
      upcast: !isBuff && leveled,
      castingMod: !isBuff,
      riderName: rider,
      riderEffect: rider,
      riderMagnitude: rider,
      riderDuration: rider,
      riderAttr: rider && v.riderEffect === StatusEffect.STAT_MODIFIER,
      riderMinTier: rider && !isHeal && !isBuff && !isAuto,
    },
    labels: {
      tier1: isHeal ? 'Heal Die:' : 'Tier 1 Die:',
      range: v.area === 'BURST' ? 'Range (0 = on you):' : 'Range (tiles):',
      areaSize: v.area === 'BURST' ? 'Burst Radius:' : 'Length (tiles):',
    },
  };
}

const join = (...dice: Die[]): string => {
  const list = dice.filter((d): d is string => d !== null && d !== '');
  return list.length === 0 ? '' : formatDiceList(list);
};

/** "Tier 1: d10 + 3   Tier 2: 2d10 + 3 …" so the dice choice reads as an outcome. */
export function spellPreview(v: Pick<SpellFormValues, 'resolution' | 'dice' | 'flatDamage'>): string {
  if (v.resolution === 'BUFF') return 'Buff: no roll, the status effect is applied directly.';
  const flat = v.flatDamage;
  const flatStr = flat === 0 ? '' : `${flat > 0 ? ' + ' : ' - '}${Math.abs(flat)}`;
  const [t1, t2, t3] = v.dice;
  if (v.resolution === 'HEAL') return t1 ? `Heals ${t1}${flatStr}.` : 'Heals nothing - pick a heal die.';
  const tier1 = join(t1);
  const tier2 = join(t1, t2);
  const tier3 = join(t1, t2, t3);
  if (v.resolution === 'AUTO')
    return tier3 === '' ? 'Deals no damage.' : `Always hits for ${tier3}${flatStr}.`;
  if (tier3 === '') return 'No damage dice: only the status effect matters.';
  return `Tier 1: ${tier1}${flatStr}   Tier 2: ${tier2}${flatStr}   Tier 3: ${tier3}${flatStr}`;
}

/** Form-level checks the dialog makes before saving (name clashes are the store's job). */
export function spellFormProblem(v: SpellFormValues): { title: string; message: string } | null {
  if (v.name.trim() === '') return { title: 'Missing Name', message: 'Give the spell a name.' };
  if (v.resolution === 'BUFF' && (!v.riderOn || v.riderName.trim() === ''))
    return {
      title: 'Buff Needs an Effect',
      message: 'A BUFF spell does nothing without a named status effect.',
    };
  return null;
}

/** The OK handler: write every field back (unknown keys of `base` survive). */
export function spellFromForm(v: SpellFormValues, base: SpellDef): SpellDef {
  const riderName = v.riderName.trim();
  return {
    ...base,
    name: v.name.trim(),
    color: v.color,
    level: clampTo(v.level, SPINNER_RANGES.level),
    school: v.school.trim(),
    description: v.description.trim(),
    resolution: v.resolution,
    targetType: v.targetType,
    range: clampTo(v.range, SPINNER_RANGES.range),
    area: v.area,
    areaSize: clampTo(v.areaSize, SPINNER_RANGES.areaSize),
    friendlyFire: v.friendlyFire,
    damageDice: [...v.dice],
    upcastDie: v.upcastDie,
    flatDamage: clampTo(v.flatDamage, SPINNER_RANGES.flatDamage),
    addCastingMod: v.addCastingMod,
    saveStat: v.saveStat,
    onSave: v.onSave,
    riderStatus:
      v.riderOn && riderName !== ''
        ? {
            name: riderName,
            effectType: v.riderEffect,
            magnitude: clampTo(v.riderMagnitude, SPINNER_RANGES.riderMagnitude),
            // a 0 duration would never expire (F-8), so the dialog turns it into 1
            duration: v.riderDuration === 0 ? 1 : clampTo(v.riderDuration, SPINNER_RANGES.riderDuration),
            targetAttribute: v.riderEffect === StatusEffect.STAT_MODIFIER ? v.riderAttr : -1,
            extra: base.riderStatus?.extra ?? {},
          }
        : null,
    riderMinTier: clampTo(v.riderMinTier, SPINNER_RANGES.riderMinTier),
  };
}

/** Effect combo entries: every status effect but NONE. */
export const RIDER_EFFECTS = STATUS_EFFECT_NAMES.map((label, value) => ({ value, label })).filter(
  (e) => e.value > 0,
);
