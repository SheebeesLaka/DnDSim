/** Spotlight DM tools: typed ±HP, hand-applied statuses, freeform turn order, arrivals, timers, ambient slider. */
import { describe, expect, it } from 'vitest';
import { StatusEffect, type StatusDef } from '../../src/assets/types.ts';
import { parseBattle, serializeBattle } from '../../src/engine/serialize.ts';
import { ambientBand, ambientLevelOf } from '../../src/engine/selectors/lighting.ts';
import { statusMeta } from '../../src/engine/rules/statuses.ts';
import type { BattleState, EngineContext } from '../../src/engine/types.ts';
import { enemy, entity, run, started, step } from '../helpers/combat.ts';

const blessed = (duration = 2): StatusDef => ({
  name: 'Blessed',
  effectType: StatusEffect.ATTACK_MODIFIER,
  magnitude: 2,
  duration,
  targetAttribute: -1,
  extra: {},
});
const current = (s: BattleState) => s.turn.order[s.turn.currentIndex];
/** Next until `id` is acting. */
function nextUntil(s: BattleState, c: EngineContext, id: string): BattleState {
  for (let i = 0; i < 20 && current(s) !== id; i++) s = run(s, c, { type: 'NEXT_TURN' });
  expect(current(s)).toBe(id);
  return s;
}

describe('APPLY_HP: typed damage and healing behave like real hits', () => {
  it('damages with a floating number and heals capped at max', () => {
    const { state, c } = started();
    const hit = step(state, c, { type: 'APPLY_HP', unitId: 'u4', delta: -7 });
    expect(hit.ok).toBe(true);
    expect(enemy(hit.state, 'u4').health).toBe(11);
    expect(hit.events).toContainEqual(
      expect.objectContaining({ type: 'floatText', text: '-7', kind: 'DAMAGE' }),
    );
    const heal = step(hit.state, c, { type: 'APPLY_HP', unitId: 'u4', delta: 50 });
    expect(enemy(heal.state, 'u4').health).toBe(18);
    expect(heal.events).toContainEqual(expect.objectContaining({ text: '+7', kind: 'HEAL' }));
    expect(step(state, c, { type: 'APPLY_HP', unitId: 'u4', delta: 0 }).ok).toBe(false);
  });

  it('defeats an enemy at 0 and drops a party member to dying', () => {
    const { state, c } = started(1, [], { entityNegativeHpPersists: false });
    const killed = run(state, c, { type: 'APPLY_HP', unitId: 'u4', delta: -99 });
    expect(killed.units.some((u) => u.id === 'u4')).toBe(false);
    const down = run(state, c, { type: 'APPLY_HP', unitId: 'u1', delta: -99 });
    expect(entity(down, 'u1').sheet.currentHP).toBe(0);
    expect(entity(down, 'u1').dying).toEqual({ successes: 0, failures: 0 });
  });
});

describe('statuses applied by hand', () => {
  it('stamps source, full duration and round; re-applying refreshes', () => {
    const { state, c } = started();
    const s = run(state, c, {
      type: 'ADD_STATUS',
      unitId: 'u1',
      status: blessed(2),
      source: 'Bless · G. Wizard',
    });
    const st = entity(s, 'u1').sheet.status.find((x) => x.name === 'Blessed') as StatusDef;
    expect(statusMeta(st)).toEqual({ source: 'Bless · G. Wizard', fullDuration: 2, appliedRound: 1 });
    const again = run(s, c, { type: 'ADD_STATUS', unitId: 'u1', status: blessed(5) });
    const st2 = entity(again, 'u1').sheet.status.filter((x) => x.name === 'Blessed');
    expect(st2).toHaveLength(1);
    expect(st2[0]?.duration).toBe(5);
    expect(statusMeta(st2[0] as StatusDef).fullDuration).toBe(5);
  });

  it('changes the numbers the roll panel reads, and can be edited and ended early', () => {
    const { state, c } = started();
    let s = run(state, c, {
      type: 'ADD_STATUS',
      unitId: 'u4',
      status: { ...blessed(3), name: 'Illuminated', effectType: StatusEffect.AC_MODIFIER, magnitude: -2 },
    });
    const atk = step(s, c, { type: 'ATTACK', attackerId: 'u1', targetId: 'u4' });
    expect(
      atk.state.pending &&
        'flow' in atk.state.pending &&
        atk.state.pending.flow.flow === 'attack' &&
        atk.state.pending.flow.targetAC,
    ).toBe(10);
    s = run(s, c, { type: 'UPDATE_STATUS', unitId: 'u4', name: 'Illuminated', patch: { duration: 6 } });
    expect(enemy(s, 'u4').statuses[0]?.duration).toBe(6);
    expect(statusMeta(enemy(s, 'u4').statuses[0] as StatusDef).fullDuration).toBe(6);
    const ended = step(s, c, { type: 'REMOVE_STATUS', unitId: 'u4', name: 'Illuminated' });
    expect(enemy(ended.state, 'u4').statuses).toHaveLength(0);
    expect(ended.events).toContainEqual({ type: 'statusExpired', unitId: 'u4', name: 'Illuminated' });
  });

  it('announces a status running out at its owner’s turn start', () => {
    const { state, c } = started();
    let s = run(state, c, { type: 'ADD_STATUS', unitId: 'u4', status: blessed(1) });
    s = nextUntil(
      s,
      c,
      s.turn.order[(s.turn.order.indexOf('u4') + s.turn.order.length - 1) % s.turn.order.length] as string,
    );
    const res = step(s, c, { type: 'NEXT_TURN' });
    expect(current(res.state)).toBe('u4');
    expect(res.events).toContainEqual({ type: 'statusExpired', unitId: 'u4', name: 'Blessed' });
    expect(enemy(res.state, 'u4').statuses).toHaveLength(0);
  });
});

describe('freeform turn order', () => {
  it('REORDER_TURN moves a combatant without changing whose turn it is, and survives a join re-sort', () => {
    const { state, c } = started();
    const acting = current(state) as string;
    const last = state.turn.order.at(-1) as string;
    let s = run(state, c, { type: 'REORDER_TURN', unitId: last, toIndex: 1 });
    expect(s.turn.order[1]).toBe(last);
    expect(current(s)).toBe(acting);
    const before = [...s.turn.order];
    s = run(s, c, { type: 'PLACE_ENEMY', templateStem: 'Spider', r: 7, c: 7 }); // rolls in and re-sorts
    expect(s.turn.order.filter((id) => before.includes(id))).toEqual(before);
  });

  it('DELAY_TURN on the acting combatant passes the turn; RETURN_FROM_HOLD keeps the new spot', () => {
    const { state, c } = started();
    const [a, b] = state.turn.order as [string, string];
    let s = run(state, c, { type: 'DELAY_TURN', unitId: a });
    expect(s.turn.held).toEqual([a]);
    expect(current(s)).toBe(b);
    s = run(s, c, { type: 'RETURN_FROM_HOLD', unitId: a, index: s.turn.order.length });
    expect(s.turn.held).toEqual([]);
    expect(s.turn.order.at(-1)).toBe(a);
    expect(current(s)).toBe(b);
    // a full round later it is still last
    for (let i = 0; i < s.turn.order.length; i++) s = run(s, c, { type: 'NEXT_TURN' });
    expect(s.turn.order.at(-1)).toBe(a);
  });

  it('acting now from the hold interrupts, and statuses never tick twice in one round', () => {
    const { state, c } = started();
    const [a] = state.turn.order as [string];
    let s = run(state, c, { type: 'ADD_STATUS', unitId: a, status: blessed(3) });
    const dur = (x: BattleState) => {
      const u = x.units.find((q) => q.id === a);
      const list = u?.kind === 'entity' ? u.sheet.status : u?.kind === 'enemy' ? u.statuses : [];
      return list.find((q) => q.name === 'Blessed')?.duration;
    };
    s = run(s, c, { type: 'NEXT_TURN' }); // a's turn is over
    s = run(s, c, { type: 'DELAY_TURN', unitId: s.turn.order[1] as string });
    const res = step(s, c, {
      type: 'RETURN_FROM_HOLD',
      unitId: s.turn.held?.[0] as string,
      index: 0,
      actNow: true,
    });
    expect(current(res.state)).toBe(s.turn.held?.[0]);
    expect(res.events).toContainEqual(expect.objectContaining({ type: 'turnChanged' }));
    // moving a (who already started this round) to act again does not tick Blessed again
    const before = dur(s);
    // toIndex is the final position: a sits above the acting combatant, so its index lands right after them
    const moved = run(
      s,
      c,
      { type: 'REORDER_TURN', unitId: a, toIndex: s.turn.currentIndex },
      { type: 'NEXT_TURN' },
    );
    expect(current(moved)).toBe(a);
    expect(dur(moved)).toBe(before);
  });

  it('a readied action lapses at its owner’s next turn', () => {
    const { state, c } = started();
    const [a] = state.turn.order as [string];
    let s = run(state, c, { type: 'SET_READIED', unitId: a, note: 'strike whoever climbs the ramp' });
    expect(s.turn.readied?.[a]).toBe('strike whoever climbs the ramp');
    for (let i = 0; i < s.turn.order.length; i++) s = run(s, c, { type: 'NEXT_TURN' });
    expect(current(s)).toBe(a);
    expect(s.turn.readied?.[a]).toBeUndefined();
  });
});

describe('arrivals, timers and the ambient slider', () => {
  it('queues and clears arrivals and timers; they are allowed mid-roll', () => {
    const { state, c } = started();
    const rolling = run(state, c, { type: 'ATTACK', attackerId: 'u1', targetId: 'u4' });
    let s = run(
      rolling,
      c,
      { type: 'ADD_ARRIVAL', templateStem: 'Spider', count: 2, round: 4, note: 'east vent' },
      {
        type: 'ADD_TIMER',
        timer: { name: 'Generator restored', round: 5, lightGroupId: 'svc', lightOn: true },
      },
    );
    expect(s.turn.arrivals).toHaveLength(1);
    expect(s.turn.arrivals?.[0]).toMatchObject({
      templateStem: 'Spider',
      count: 2,
      round: 4,
      note: 'east vent',
    });
    expect(s.turn.timers?.[0]).toMatchObject({ name: 'Generator restored', round: 5, lightGroupId: 'svc' });
    expect(step(s, c, { type: 'ADD_ARRIVAL', templateStem: 'Nope', count: 1, round: 2 }).ok).toBe(false);
    s = run(
      s,
      c,
      { type: 'REMOVE_ARRIVAL', id: s.turn.arrivals?.[0]?.id as string },
      { type: 'REMOVE_TIMER', id: s.turn.timers?.[0]?.id as string },
    );
    expect(s.turn.arrivals).toEqual([]);
    expect(s.turn.timers).toEqual([]);
  });

  it('SET_AMBIENT_LEVEL keeps the bright/dim/dark band in step; old saves get a level', () => {
    const { state, c } = started();
    const s = run(state, c, { type: 'SET_AMBIENT_LEVEL', level: 35 });
    expect(s.board).toMatchObject({ ambientLevel: 35, ambient: 'dim' });
    expect(run(s, c, { type: 'SET_AMBIENT_LEVEL', level: 140 }).board).toMatchObject({
      ambientLevel: 100,
      ambient: 'bright',
    });
    expect(run(s, c, { type: 'SET_AMBIENT', level: 'dark' }).board).toMatchObject({
      ambientLevel: 0,
      ambient: 'dark',
    });
    expect([0, 19, 20, 66, 67, 100].map(ambientBand)).toEqual([
      'dark',
      'dark',
      'dim',
      'dim',
      'bright',
      'bright',
    ]);
    const old = JSON.parse(serializeBattle(s)) as BattleState;
    delete old.board.ambientLevel;
    old.board.ambient = 'dim';
    expect(ambientLevelOf(parseBattle(JSON.stringify(old)).board)).toBe(35);
  });
});
