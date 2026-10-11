/** Spell display strings, ported from EntityRes/Spell.java (getLevelLabel … getSummary). */
import type { SpellDef } from './types.ts';

export const levelLabel = (s: Pick<SpellDef, 'level'>): string =>
  s.level === 0 ? 'Cantrip' : `Level ${s.level}`;

export const rangeLabel = (s: Pick<SpellDef, 'range'>): string =>
  s.range === 0 ? 'Self' : s.range === 1 ? 'Touch' : `${s.range} tiles`;

export function areaLabel(s: Pick<SpellDef, 'area' | 'areaSize' | 'range'>): string {
  if (s.area === 'NONE') return '';
  const shape = `${s.area[0]}${s.area.slice(1).toLowerCase()} ${s.areaSize}`;
  if (s.area === 'BURST') return shape + (s.range === 0 ? ' around you' : ` @ ${s.range} tiles`);
  return shape;
}

/** "d10 / d10 / d12" with blank tiers as "-", or "" when the spell has no dice. */
export function diceLabel(s: Pick<SpellDef, 'damageDice'>): string {
  const dice = [0, 1, 2].map((i) => s.damageDice[i] ?? null);
  return dice.some((d) => d !== null && d !== '') ? dice.map((d) => (d ? d : '-')).join(' / ') : '';
}

const isFriendly = (s: Pick<SpellDef, 'resolution'>) => s.resolution === 'HEAL' || s.resolution === 'BUFF';

/** One-line mechanical summary, e.g. "DEX save · 6 tiles · d8 / d8 / d10 · Burning". */
export function spellSummary(s: SpellDef): string {
  let out: string;
  switch (s.resolution) {
    case 'SAVE':
      out = `${s.saveStat.slice(0, 3)} save${s.onSave === 'HALF' ? ' (half)' : ''}`;
      break;
    case 'HEAL':
      out = 'Heal';
      break;
    case 'BUFF':
      out = 'Buff';
      break;
    case 'AUTO':
      out = 'Auto-hit';
      break;
    case 'ATTACK':
      out = 'Spell attack';
  }
  out += ` · ${s.area !== 'NONE' ? areaLabel(s) : rangeLabel(s)}`;
  const dice = diceLabel(s);
  if (dice && s.resolution !== 'BUFF') {
    out += ` · ${s.resolution === 'HEAL' && s.damageDice[0] ? s.damageDice[0] : dice}`;
    if (s.flatDamage !== 0) out += `${s.flatDamage > 0 ? ' +' : ' '}${s.flatDamage}`;
  }
  if (s.riderStatus?.name) {
    out += ` · ${s.riderStatus.name}`;
    if (!isFriendly(s) && s.riderMinTier > 1) out += ` (T${s.riderMinTier}+)`;
  }
  return out;
}
