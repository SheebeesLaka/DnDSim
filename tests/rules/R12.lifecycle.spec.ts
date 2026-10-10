/** R2.4, R2.7, R8.7, R8.11, Long Rest: Begin processing, End/victory, rest. */
import { describe, expect, it } from 'vitest';
import { StatusEffect } from '../../src/assets/types.ts';
import type { EntityUnit } from '../../src/engine/types.ts';
import { ctx, fresh, mutateUnit, run, status, step, unitNamed } from '../helpers/engine.ts';

describe('Begin processing (R8.7 / F-3)', () => {
  it('legacy: the first combatant gets ON_TURN_START abilities but no status tick; fixed: full processing', () => {
    for (const legacy of [true, false]) {
      const c = ctx(1);
      let s = fresh({ partyList: [], compat: { beginSkipsFirstStatusTick: legacy } }).state;
      s = run(s, c, { type: 'PLACE_ENTITY', name: 'NMB-15', r: 0, c: 0 }); // REGEN 2, 18/24
      s = mutateUnit<EntityUnit>(s, 'u1', (e) => {
        e.sheet.status.push(status('Burning', StatusEffect.DAMAGE_OVER_TIME, 5, 2));
      });
      s = run(s, c, { type: 'BEGIN_BATTLE' }, { type: 'SUBMIT_INITIATIVE', rolls: { u1: 15 } });
      const e = unitNamed(s, 'NMB-15') as EntityUnit;
      // legacy: +2 (abilities only) = 20, status untouched (duration 2)
      // fixed: DOT -5 -> 13, +2 inside procStatus, +2 again (double fire still on) -> 17, duration 1
      expect(e.sheet.currentHP).toBe(legacy ? 20 : 17);
      expect(e.sheet.status[0]?.duration).toBe(legacy ? 2 : 1);
    }
  });
});

describe('End battle (R2.7, R8.11, F-2)', () => {
  it('victory when enemies are gone or any was defeated (legacy); only when none remain (fixed)', () => {
    for (const legacy of [true, false]) {
      const c = ctx(1);
      let s = fresh({ partyList: [], compat: { victoryOnAnyDefeat: legacy } }).state;
      s = run(
        s,
        c,
        { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 },
        { type: 'PLACE_ENEMY', templateStem: 'Spider', r: 3, c: 3 },
        { type: 'PLACE_ENEMY', templateStem: 'Snake', r: 4, c: 4 },
      );
      s = run(s, c, { type: 'BEGIN_BATTLE' }, { type: 'SUBMIT_INITIATIVE', rolls: { u1: 10 } });
      const counted = { ...s, turn: { ...s.turn, enemiesDefeated: 1 } };
      const res = step(counted, c, { type: 'END_BATTLE' });
      expect(res.ok && res.state.turn.victory).toBe(legacy);
      expect(res.events).toContainEqual({ type: 'battleEnded', victory: legacy });
      const noEnemies = run(
        s,
        c,
        { type: 'REMOVE_UNIT', unitId: 'u2' },
        { type: 'REMOVE_UNIT', unitId: 'u3' },
        { type: 'END_BATTLE' },
      );
      expect(noEnemies.turn.victory).toBe(true);
      expect(noEnemies.turn.started).toBe(false);
      expect(noEnemies.turn.ended).toBe(true);
      // Delete does not count as a defeat
      const deleted = run(s, c, { type: 'REMOVE_UNIT', unitId: 'u2' }, { type: 'END_BATTLE' });
      expect(deleted.turn.victory).toBe(false);
    }
    expect(step(fresh({ partyList: [] }).state, ctx(), { type: 'END_BATTLE' })).toMatchObject({
      ok: false,
      error: { code: 'notStarted' },
    });
  });
});

describe('Long Rest', () => {
  it('restores every slot of every party caster on the board; info alert when there are none', () => {
    const c = ctx();
    let s = run(
      fresh({ partyList: [] }).state,
      c,
      { type: 'PLACE_ENTITY', name: 'Grand Wizard Man', r: 0, c: 0 },
      { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 1 },
    );
    s = mutateUnit<EntityUnit>(s, 'u1', (e) => void (e.sheet.spellSlotsUsed = [2, 1, 0, 0, 0, 0, 0, 0, 0]));
    const res = step(s, c, { type: 'LONG_REST' });
    expect(res.ok && (unitNamed(res.state, 'Grand Wizard Man') as EntityUnit).sheet.spellSlotsUsed).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(res.events.filter((e) => e.type === 'floatText')).toHaveLength(1);
    const none = step(
      run(fresh({ partyList: [] }).state, c, { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 1 }),
      c,
      { type: 'LONG_REST' },
    );
    expect(none.events).toContainEqual(expect.objectContaining({ type: 'alert', title: 'Long Rest' }));
  });
});
