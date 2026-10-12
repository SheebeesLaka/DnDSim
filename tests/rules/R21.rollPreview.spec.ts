/** The live roll panel predicts exactly what SUBMIT_ROLL then does; the Active effects list sorts and labels. */
import { describe, expect, it } from 'vitest';
import { StatusEffect, type StatusDef } from '../../src/assets/types.ts';
import { buildEffectRows } from '../../src/engine/view/effects.ts';
import { buildBoardViewModel } from '../../src/engine/view/boardViewModel.ts';
import { DEFAULT_DISPLAY_OPTIONS } from '../../src/engine/view/displayOptions.ts';
import { projectForPlayer } from '../../src/engine/view/playerProjection.ts';
import { buildRollVM, emptyDraft, type RollDraft } from '../../src/engine/view/rollPreview.ts';
import { sumParts } from '../../src/engine/selectors/breakdown.ts';
import type { BattleState } from '../../src/engine/types.ts';
import { enemy, run, started, step } from '../helpers/combat.ts';

const blessed: StatusDef = {
  name: 'Blessed',
  effectType: StatusEffect.ATTACK_MODIFIER,
  magnitude: 2,
  duration: 2,
  targetAttribute: -1,
  extra: {},
};
const draft = (p: Partial<RollDraft>): RollDraft => ({ ...emptyDraft(), ...p });

describe('roll preview: attack', () => {
  it('shows the named breakdown, total, margin, tier and the dice the tier leads to', () => {
    const { state, c } = started();
    const s = run(
      state,
      c,
      { type: 'ADD_STATUS', unitId: 'u1', status: blessed },
      { type: 'ATTACK', attackerId: 'u1', targetId: 'u4' },
    );
    const empty = buildRollVM(s);
    expect(empty?.kind).toBe('attack');
    expect(empty?.d20).toMatchObject({ active: true, value: null });
    expect(empty?.total).toBeNull();
    expect(empty?.modParts.map((p) => `${p.label} ${p.value}`)).toEqual(['STR 6', 'Blessed 2']);
    expect(empty?.vs).toMatchObject({ label: 'AC', value: 12 });
    const vm = buildRollVM(s, draft({ d20: '9' }));
    expect(vm).toMatchObject({ total: 17, margin: 5, tier: 2, outcome: 'hit', toNextTier: 3 });
    expect(vm?.previewDice).toEqual(['d4', 'd4']); // Henry is unarmed in the fixture
    expect(sumParts(vm?.bonusParts ?? [])).toBe(5);
    expect(vm?.bonusParts.map((p) => p.label)).toEqual(['STR ½', 'Blessed']);
  });

  it.each(Array.from({ length: 20 }, (_, i) => i + 1))(
    'd20 %i: the preview matches what SUBMIT_ROLL applies',
    (d20) => {
      const { state, c } = started();
      const s = run(state, c, { type: 'ATTACK', attackerId: 'u1', targetId: 'u4' });
      const before = buildRollVM(s, draft({ d20: String(d20) }));
      const rolled = step(s, c, { type: 'SUBMIT_ROLL', d20 });
      expect(rolled.ok).toBe(true);
      const p = rolled.state.pending;
      if (before?.outcome === 'miss') {
        expect(p?.kind).toBe('confirm');
        return;
      }
      expect(p?.kind).toBe('damage');
      if (p?.kind !== 'damage') return;
      expect(p.tier).toBe(before?.tier);
      expect(p.dice).toEqual(before?.previewDice);
      const dice = p.dice.map(() => '3');
      const vm = buildRollVM(rolled.state, draft({ dice }));
      expect(vm?.complete).toBe(true);
      const applied = run(rolled.state, c, { type: 'SUBMIT_ROLL', dice: dice.map(Number) });
      const hpBefore = enemy(s, 'u4').health;
      const hpAfter = applied.units.some((u) => u.id === 'u4') ? enemy(applied, 'u4').health : 0;
      expect(hpBefore - hpAfter).toBe(Math.min(hpBefore, vm?.damage ?? -1));
      expect(vm?.target?.hpAfter).toBe(hpAfter);
    },
  );

  it('marks the next die as active while typing and totals partial entries', () => {
    const { state, c } = started();
    const s = run(
      state,
      c,
      { type: 'ATTACK', attackerId: 'u1', targetId: 'u4' },
      { type: 'SUBMIT_ROLL', d20: 20 },
    );
    const vm = buildRollVM(s, draft({ dice: ['4'], cursor: 1 }));
    expect(vm?.crit).toBe(true);
    expect(vm?.dice.map((d) => d.active)).toEqual([false, true, false]);
    expect(vm?.complete).toBe(false);
    expect(vm?.damage).not.toBeNull();
  });
});

describe('roll preview: saving throw spells', () => {
  it('reads the target save against the caster DC', () => {
    const { state, c } = started();
    const s = run(state, c, {
      type: 'CAST_SPELL',
      casterId: 'u3',
      spellName: 'Sacred Flame',
      slotLevel: 0,
      targetId: 'u5',
    });
    const vm = buildRollVM(s, draft({ d20: '2' }));
    expect(vm?.kind).toBe('save');
    expect(vm?.vs?.label).toBe('DC');
    expect(sumParts(vm?.vs?.parts ?? [])).toBe(vm?.vs?.value);
    expect(vm?.outcome).toBe('failed');
    const hi = buildRollVM(s, draft({ d20: '20' }));
    expect(['saved', 'half']).toContain(hi?.outcome);
  });
});

describe('active effects list', () => {
  it('sorts soonest-ending first and names the owner when it ends this round', () => {
    const { state, c } = started();
    const s: BattleState = run(
      state,
      c,
      {
        type: 'ADD_STATUS',
        unitId: 'u4',
        status: { ...blessed, name: 'Burning', effectType: StatusEffect.DAMAGE_OVER_TIME, duration: 3 },
      },
      {
        type: 'ADD_STATUS',
        unitId: 'u5',
        status: {
          ...blessed,
          name: 'Chilled',
          effectType: StatusEffect.MOVEMENT_MODIFIER,
          magnitude: -2,
          duration: 1,
        },
      },
      { type: 'ADD_ARRIVAL', templateStem: 'Spider', count: 2, round: 2 },
      { type: 'SET_READIED', unitId: 'u2', note: 'shoot the first one through the door' },
    );
    const rows = buildEffectRows(s, c.assets);
    expect(rows.map((r) => r.name)).toEqual(['Chilled', 'Spider ×2', 'Burning', 'Readied']);
    const chilled = rows[0];
    const snakeActed = s.turn.tickedRound?.u5 === s.turn.round;
    expect(chilled?.soon).toBe(!snakeActed);
    expect(chilled?.family).toBe('debuff');
    expect(chilled?.fx).toBe('−2 MOB');
    expect(rows[2]?.family).toBe('dot');
    expect(rows[2]?.fx).toBe('2 dmg / turn');
  });
});

describe('player view of the roll and the effects list', () => {
  it('shows the live roll and statuses but not queued arrivals, timers or enemy readied actions', () => {
    const { state, c } = started();
    const s = run(
      state,
      c,
      { type: 'ADD_STATUS', unitId: 'u4', status: blessed },
      { type: 'ADD_ARRIVAL', templateStem: 'Spider', count: 2, round: 3 },
      { type: 'ADD_TIMER', timer: { name: 'Generator restored', round: 5 } },
      { type: 'SET_READIED', unitId: 'u5', note: 'bite whoever comes close' },
      { type: 'SET_READIED', unitId: 'u2', note: 'cover the door' },
      { type: 'ATTACK', attackerId: 'u1', targetId: 'u4' },
    );
    const dm = buildBoardViewModel(
      s,
      { selectedId: 'u1', mode: { kind: 'none' }, hover: null, rollDraft: draft({ d20: '11' }) },
      c.assets,
    );
    expect(dm.roll?.total).toBe(17);
    expect(dm.effects?.map((r) => r.kind).sort()).toEqual([
      'arrival',
      'readied',
      'readied',
      'status',
      'timer',
    ]);
    const tv = projectForPlayer(dm, { ...DEFAULT_DISPLAY_OPTIONS, enemyHp: 'HIDDEN', enemyNames: false });
    expect(tv.roll?.total).toBe(17);
    expect(tv.roll?.target?.hpShown).toBe('none');
    expect(tv.roll?.target?.name).toMatch(/^Enemy/);
    expect(tv.effects?.map((r) => `${r.kind}:${r.side}`).sort()).toEqual(['readied:party', 'status:enemy']);
    expect(tv.arrivals).toEqual([]);
  });
});
