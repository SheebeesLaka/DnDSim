/** F-4 fixed (the DM's call, 2026-10-21): damage over time can drop a creature to 0 HP at the start of its turn. */
import { describe, expect, it } from 'vitest';
import { StatusEffect } from '../../src/assets/types.ts';
import { RECOMMENDED_COMPAT } from '../../src/engine/compat.ts';
import type { BattleEvent, BattleState, EngineContext } from '../../src/engine/types.ts';
import { entity, enemy, run, started, step } from '../helpers/combat.ts';
import { status } from '../helpers/engine.ts';

const current = (s: BattleState) => s.turn.order[s.turn.currentIndex];

/** Next turn until `done` holds, keeping the rolled order when a tie comes up; returns the last step's events. */
function nextUntil(s: BattleState, c: EngineContext, done: (s: BattleState) => boolean) {
  let events: BattleEvent[] = [];
  for (let i = 0; i < 12 && !done(s); i++) {
    if (s.pending?.kind === 'tieOrder') s = run(s, c, { type: 'DISMISS_TIES' });
    const res = step(s, c, { type: 'NEXT_TURN' });
    if (!res.ok) throw new Error(res.error.message);
    s = res.state;
    events = res.events;
  }
  expect(done(s)).toBe(true);
  return { s, events };
}

describe('damage over time can defeat (F-4 fixed)', () => {
  it('an enemy burnt to 0 at the start of its turn is defeated and the next creature acts', () => {
    const { state, c } = started(1, [], RECOMMENDED_COMPAT);
    let s = run(
      state,
      c,
      { type: 'SET_HP', unitId: 'u4', hp: 2 },
      { type: 'ADD_STATUS', unitId: 'u4', status: status('Burning', StatusEffect.DAMAGE_OVER_TIME, 5, 2) },
    );
    const order = [...s.turn.order];
    const after = order[(order.indexOf('u4') + 1) % order.length];
    const res = nextUntil(s, c, (x) => !x.units.some((u) => u.id === 'u4'));
    s = res.s;
    expect(s.turn.enemiesDefeated).toBe(1);
    expect(current(s)).toBe(after);
    expect(res.events).toContainEqual(
      expect.objectContaining({ type: 'floatText', unitId: 'u4', text: '-2' }),
    );
    expect(res.events).toContainEqual(
      expect.objectContaining({ type: 'unitRemoved', unitId: 'u4', reason: 'defeated' }),
    );
    expect(res.events.at(-1)).toMatchObject({ type: 'turnChanged', unitId: after });
  });

  it('a hero burnt to 0 starts dying on the board; healing over time brings them back up', () => {
    const { state, c } = started(1, [], RECOMMENDED_COMPAT);
    let s = run(
      state,
      c,
      { type: 'SET_HP', unitId: 'u1', hp: 1 },
      { type: 'ADD_STATUS', unitId: 'u1', status: status('Burning', StatusEffect.DAMAGE_OVER_TIME, 2, 1) },
    );
    // u1 may be acting already: its Burning ticks at its next turn start
    s = nextUntil(s, c, (x) => entity(x, 'u1').dying !== null).s;
    expect(entity(s, 'u1').sheet.currentHP).toBe(0);
    expect(current(s)).toBe('u1');
    s = run(s, c, {
      type: 'ADD_STATUS',
      unitId: 'u1',
      status: status('Regenerating', StatusEffect.HEAL_OVER_TIME, 2, 3),
    });
    s = nextUntil(s, c, (x) => entity(x, 'u1').dying === null).s;
    expect(entity(s, 'u1').sheet.currentHP).toBe(2);
  });

  it('with the Java rule (F-4 legacy) the burn stops at 1 HP', () => {
    const { state, c } = started(1, [], { ...RECOMMENDED_COMPAT, dotCannotKill: true });
    let s = run(
      state,
      c,
      { type: 'SET_HP', unitId: 'u4', hp: 2 },
      { type: 'ADD_STATUS', unitId: 'u4', status: status('Burning', StatusEffect.DAMAGE_OVER_TIME, 5, 2) },
    );
    s = nextUntil(s, c, (x) => enemy(x, 'u4').health < 2).s;
    expect(enemy(s, 'u4').health).toBe(1);
    expect(s.turn.enemiesDefeated).toBe(0);
  });
});
