/** Roll-panel breakdowns: every *Parts list sums to the stats.ts number it explains. */
import { describe, expect, it } from 'vitest';
import { StatusEffect, type StatusDef } from '../../src/assets/types.ts';
import { weaponDamageBonus } from '../../src/engine/rules/combat.ts';
import {
  acParts,
  attackParts,
  castingParts,
  halfBonusParts,
  saveDCParts,
  saveParts,
  spellAttackParts,
  sumParts,
} from '../../src/engine/selectors/breakdown.ts';
import {
  armorClass,
  attackModifier,
  castingModifier,
  saveModifier,
  spellAttackModifier,
  spellSaveDC,
} from '../../src/engine/selectors/stats.ts';
import type { BattleState, Combatant } from '../../src/engine/types.ts';
import { run, started } from '../helpers/combat.ts';

const st = (name: string, effectType: number, magnitude: number, targetAttribute = -1): StatusDef => ({
  name,
  effectType,
  magnitude,
  duration: 3,
  targetAttribute,
  extra: {},
});

/** Every combatant with a pile of statuses and DM tweaks on it. */
function busy(): BattleState {
  const { state, c } = started();
  const s = run(
    state,
    c,
    { type: 'ADJUST_STAT', unitId: 'u1', attribute: 0, delta: 2 },
    { type: 'ADJUST_AC', unitId: 'u1', delta: -1 },
    { type: 'ADJUST_STAT', unitId: 'u4', attribute: 1, delta: 1 },
    { type: 'ADJUST_AC', unitId: 'u5', delta: 2 },
  );
  const out = JSON.parse(JSON.stringify(s)) as BattleState;
  for (const u of out.units) {
    const list = u.kind === 'entity' ? u.sheet.status : u.kind === 'enemy' ? u.statuses : null;
    list?.push(
      st('Blessed', StatusEffect.ATTACK_MODIFIER, 2),
      st('Shield of Faith', StatusEffect.AC_MODIFIER, 2),
      st('Illuminated', StatusEffect.AC_MODIFIER, -2),
      st('Weakened', StatusEffect.STAT_MODIFIER, -1, 0),
      st('Sharp', StatusEffect.STAT_MODIFIER, 1, 3),
    );
  }
  return out;
}

const combatantsOf = (s: BattleState) =>
  s.units.filter((u): u is Combatant => u.kind === 'entity' || u.kind === 'enemy');

describe('breakdown parts sum to the stat they explain', () => {
  for (const [label, state] of [
    ['plain', started().state],
    ['statuses + tweaks', busy()],
  ] as const) {
    it(`${label}: attack, AC, casting, spell attack, save DC, every save`, () => {
      for (const u of combatantsOf(state)) {
        expect(sumParts(attackParts(u)), `${u.id} attack`).toBe(attackModifier(u));
        expect(sumParts(acParts(u)), `${u.id} AC`).toBe(armorClass(u));
        expect(sumParts(castingParts(u)), `${u.id} casting`).toBe(castingModifier(u));
        expect(sumParts(spellAttackParts(u)), `${u.id} spell attack`).toBe(spellAttackModifier(u));
        expect(sumParts(saveDCParts(u)), `${u.id} DC`).toBe(spellSaveDC(u));
        for (let i = 0; i < 6; i++)
          expect(sumParts(saveParts(u, i)), `${u.id} save ${i}`).toBe(saveModifier(u, i));
      }
    });
  }

  it('names each status and tweak as its own part', () => {
    const henry = combatantsOf(busy()).find((u) => u.id === 'u1') as Combatant;
    const labels = attackParts(henry).map((p) => `${p.label}:${p.value}:${p.kind}`);
    expect(labels).toEqual(['STR:6:stat', 'Weakened:-1:status', 'Adjust:2:adjust', 'Blessed:2:status']);
  });
});

describe('halfBonusParts splits the flat damage bonus (R6.5) without changing it', () => {
  it.each([
    [[7], 4], // STR 7 → +4
    [[7, 2], 5], // + Blessed 2 → +5, shown as STR ½ 4 + Blessed 1
    [[5, 2], 4],
    [[0], 1],
    [[-3], -1],
    [[6, -1, 2, 2], 5],
  ])('mods %j → bonus %i', (values, bonus) => {
    const parts = values.map((v, i) => ({
      label: i === 0 ? 'STR' : `s${i}`,
      value: v,
      kind: i === 0 ? ('stat' as const) : ('status' as const),
    }));
    const half = halfBonusParts(parts);
    expect(sumParts(half)).toBe(bonus);
    expect(sumParts(half)).toBe(weaponDamageBonus(sumParts(parts)));
  });

  it('labels the stat share and the status share', () => {
    const half = halfBonusParts([
      { label: 'STR', value: 7, kind: 'stat' },
      { label: 'Blessed', value: 2, kind: 'status' },
    ]);
    expect(half).toEqual([
      { label: 'STR ½', value: 4, kind: 'stat' },
      { label: 'Blessed', value: 1, kind: 'status' },
    ]);
  });
});
