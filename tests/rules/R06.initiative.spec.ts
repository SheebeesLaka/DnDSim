/** R8.1–R8.10: initiative, Surprise/Ambush, ties, Next, mid-battle joins and removals. */
import { describe, expect, it } from 'vitest';
import { displayInitiative } from '../../src/engine/rules/initiative.ts';
import { seededRng } from '../../src/engine/rng.ts';
import type { BattleState, Command, EngineContext } from '../../src/engine/types.ts';
import { ctx, engineAssets, fresh, run, step, unitNamed } from '../helpers/engine.ts';

function board(seed = 1) {
  const c = ctx(seed);
  let state = fresh({ partyList: [] }, undefined, c).state;
  state = run(
    state,
    c,
    { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 }, // DEX 2
    { type: 'PLACE_ENTITY', name: 'Grand Wizard Man', r: 0, c: 1 }, // DEX 12
    { type: 'PLACE_ENEMY', templateStem: 'Spider', r: 5, c: 5 }, // DEX 4
    { type: 'PLACE_ENEMY', templateStem: 'Snake', r: 5, c: 6 }, // DEX 7
  );
  return { state, c };
}
const begin = (
  state: BattleState,
  c: EngineContext,
  rolls: Record<string, number>,
  extra: Command[] = [],
): BattleState => run(state, c, ...extra, { type: 'BEGIN_BATTLE' }, { type: 'SUBMIT_INITIATIVE', rolls });

describe('R8.1 inputs and totals', () => {
  it('party uses the typed d20 (1-20) + adjusted DEX; others roll; stable descending sort', () => {
    const { state, c } = board(5);
    const s = begin(state, c, { u1: 20, u2: 3 });
    expect(s.turn.started).toBe(true);
    expect(s.turn.initiative.u1).toEqual({ total: 22, d20: 20, mod: 2 });
    expect(s.turn.initiative.u2).toEqual({ total: 15, d20: 3, mod: 12 });
    expect(s.turn.initiative.u3?.mod).toBe(4);
    expect(s.turn.initiative.u4?.mod).toBe(7);
    const totals = s.turn.order.map((id) => s.turn.initiative[id]?.total ?? 0);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    expect(s.turn.currentIndex).toBe(0);
    expect(s.turn.round).toBe(1);
    expect(s.pending).toBeNull();
  });

  it('Begin needs an entity; with no party member it commits immediately; inline entry can be cancelled', () => {
    const c = ctx();
    const empty = run(fresh({ partyList: [] }).state, c, {
      type: 'PLACE_ENEMY',
      templateStem: 'Spider',
      r: 0,
      c: 0,
    });
    const res = step(empty, c, { type: 'BEGIN_BATTLE' });
    expect(res).toMatchObject({ ok: false, error: { code: 'noEntities' } });
    expect(res.events).toContainEqual(expect.objectContaining({ type: 'alert', title: 'No Entities' }));
    const { state } = board();
    const open = run(state, c, { type: 'BEGIN_BATTLE' });
    expect(open.pending).toEqual({ kind: 'initiativeEntry', party: ['u1', 'u2'] });
    expect(step(open, c, { type: 'NEXT_TURN' })).toMatchObject({
      ok: false,
      error: { code: 'pendingInput' },
    });
    expect(step(open, c, { type: 'SUBMIT_INITIATIVE', rolls: { u1: 10 } })).toMatchObject({
      ok: false,
      error: { code: 'invalidRoll' },
    });
    expect(step(open, c, { type: 'SUBMIT_INITIATIVE', rolls: { u1: 10, u2: 0 } })).toMatchObject({
      ok: false,
      error: { code: 'invalidRoll' },
    });
    const cancelled = run(open, c, { type: 'CANCEL_INITIATIVE_ENTRY' });
    expect(cancelled.pending).toBeNull();
    expect(cancelled.turn.started).toBe(false);
  });
});

describe('R8.3 Surprise / Ambush', () => {
  it('adds +100 to one side for the whole battle; display strips it with > 100', () => {
    const { state, c } = board(2);
    const surprise = begin(state, c, { u1: 1, u2: 1 }, [{ type: 'SET_ROUND_START_MODE', mode: 'SURPRISE' }]);
    expect(surprise.turn.initiative.u1?.total).toBe(103);
    expect(surprise.turn.initiative.u2?.total).toBe(113);
    expect(surprise.turn.order.slice(0, 2).sort()).toEqual(['u1', 'u2']);
    expect(displayInitiative(103)).toBe(3);
    const ambush = begin(state, c, { u1: 20, u2: 20 }, [{ type: 'SET_ROUND_START_MODE', mode: 'AMBUSH' }]);
    expect(ambush.turn.order.slice(0, 2).sort()).toEqual(['u3', 'u4']);
    expect(step(ambush, c, { type: 'SET_ROUND_START_MODE', mode: 'NORMAL' })).toMatchObject({
      ok: false,
      error: { code: 'battleStarted' },
    });
    // a total of exactly 100 is NOT stripped (F-6)
    expect(displayInitiative(100)).toBe(100);
  });
});

describe('R8.5 / R8.6 ties', () => {
  it('party-only ties queue a tie dialog; RESOLVE_TIE applies the chosen order; cancel re-offers next round', () => {
    const c = ctx(3);
    let state = fresh({ partyList: [] }).state;
    // Henry (DEX 2) and Temerity (DEX 5): roll 10 and 7 -> both 12
    state = run(
      state,
      c,
      { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 },
      { type: 'PLACE_ENTITY', name: 'Temerity', r: 0, c: 1 },
    );
    state = begin(state, c, { u1: 10, u2: 7 });
    expect(state.turn.pendingTies).toEqual([['u1', 'u2']]);
    expect(state.pending).toEqual({ kind: 'tieOrder', groups: [['u1', 'u2']] });
    expect(step(state, c, { type: 'RESOLVE_TIE', group: ['u1', 'u2'], order: ['u2'] })).toMatchObject({
      ok: false,
      error: { code: 'invalidOrder' },
    });
    const dismissed = run(state, c, { type: 'DISMISS_TIES' });
    expect(dismissed.pending).toBeNull();
    expect(dismissed.turn.pendingTies).toHaveLength(1);
    const next = run(dismissed, c, { type: 'NEXT_TURN' }, { type: 'NEXT_TURN' });
    expect(next.turn.round).toBe(2);
    expect(next.pending?.kind).toBe('tieOrder');
    const resolved = run(next, c, { type: 'RESOLVE_TIE', group: ['u2', 'u1'], order: ['u2', 'u1'] });
    expect(resolved.turn.order).toEqual(['u2', 'u1']);
    expect(resolved.turn.pendingTies).toEqual([]);
    expect(resolved.pending).toBeNull();
  });

  it('a tie involving a non-party combatant shuffles the whole group (party included) with no dialog', () => {
    // find a seed where the enemy roll ties a party member's typed total
    for (let seed = 1; seed < 400; seed++) {
      const c = ctx(seed);
      let state = fresh({ partyList: [] }).state;
      state = run(
        state,
        c,
        { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 },
        { type: 'PLACE_ENEMY', templateStem: 'Spider', r: 5, c: 5 },
      );
      const s = begin(state, c, { u1: 10 }); // Henry total 12; Spider needs d20 8
      if (s.turn.initiative.u2?.total !== 12) continue;
      expect(s.turn.pendingTies).toEqual([]);
      expect(s.pending).toBeNull();
      expect([...s.turn.order].sort()).toEqual(['u1', 'u2']);
      return;
    }
    throw new Error('no tying seed found');
  });

  it('F-7: with npcEntitiesLegacySide off, non-party entities count as party-side for Ambush', () => {
    const assets = engineAssets();
    const npcSheet = { ...assets.party['Henry Keaton']!, name: 'Guard', isParty: false };
    const custom = { ...assets, party: { ...assets.party, Guard: npcSheet } };
    for (const legacy of [true, false]) {
      const c: EngineContext = { rng: seededRng(1), assets: custom };
      let state = fresh({ partyList: [], compat: { npcEntitiesLegacySide: legacy } }, undefined, c).state;
      state = run(
        state,
        c,
        { type: 'PLACE_ENTITY', name: 'Guard', r: 0, c: 0 },
        { type: 'PLACE_ENEMY', templateStem: 'Spider', r: 5, c: 5 },
      );
      // no party member on the field: Begin commits without the inline entry step
      state = run(state, c, { type: 'SET_ROUND_START_MODE', mode: 'AMBUSH' }, { type: 'BEGIN_BATTLE' });
      expect(state.pending).toBeNull();
      expect(state.turn.initiative.u1!.total > 100).toBe(legacy);
    }
  });
});

describe('R8.8 Next, R8.9 joins, R8.10 removals', () => {
  it('Next advances, wraps with round++, and processes the new combatant', () => {
    const { state, c } = board(4);
    let s = begin(state, c, { u1: 20, u2: 1 });
    const n = s.turn.order.length;
    for (let i = 1; i < n; i++) s = run(s, c, { type: 'NEXT_TURN' });
    expect(s.turn.currentIndex).toBe(n - 1);
    expect(s.turn.round).toBe(1);
    const res = step(s, c, { type: 'NEXT_TURN' });
    expect(res.ok && res.state.turn.round === 2 && res.state.turn.currentIndex === 0).toBe(true);
    expect(res.events).toContainEqual({ type: 'turnChanged', unitId: res.state.turn.order[0], round: 2 });
    expect(step(state, c, { type: 'NEXT_TURN' })).toMatchObject({ ok: false, error: { code: 'notStarted' } });
  });

  it('joining mid-battle rolls a random d20 + DEX, re-sorts, keeps the acting combatant', () => {
    const { state, c } = board(6);
    let s = begin(state, c, { u1: 20, u2: 1 });
    s = run(s, c, { type: 'NEXT_TURN' });
    const acting = s.turn.order[s.turn.currentIndex];
    const res = step(s, c, { type: 'PLACE_ENEMY', templateStem: 'Snake', r: 7, c: 7 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.turn.order).toHaveLength(5);
    expect(res.state.turn.order[res.state.turn.currentIndex]).toBe(acting);
    expect(res.state.turn.initiative.u5?.total).toBeLessThan(100);
    expect(res.events).toContainEqual(expect.objectContaining({ type: 'floatText', kind: 'INITIATIVE' }));
    const totals = res.state.turn.order.map((id) => res.state.turn.initiative[id]?.total ?? 0);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
  });

  it('removal before the current index shifts it; wrapping after a removal resets to 0 without round++ (legacy) or with (fixed)', () => {
    for (const legacy of [true, false]) {
      const c = ctx(8);
      let s = fresh({ partyList: [], compat: { removalWrapNoRoundIncrement: legacy } }).state;
      s = run(
        s,
        c,
        { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 },
        { type: 'PLACE_ENEMY', templateStem: 'Spider', r: 5, c: 5 },
        { type: 'PLACE_ENEMY', templateStem: 'Snake', r: 5, c: 6 },
      );
      s = begin(s, c, { u1: 20 }); // Henry first (22)
      s = run(s, c, { type: 'NEXT_TURN' }, { type: 'NEXT_TURN' }); // index 2 (last)
      const first = s.turn.order[0]!;
      const removedFirst = run(s, c, { type: 'REMOVE_UNIT', unitId: first });
      expect(removedFirst.turn.currentIndex).toBe(1);
      const last = s.turn.order[2]!;
      const removedCurrent = run(s, c, { type: 'REMOVE_UNIT', unitId: last });
      expect(removedCurrent.turn.currentIndex).toBe(0);
      expect(removedCurrent.turn.round).toBe(legacy ? 1 : 2);
    }
  });

  it('removing a tied member drops it from the pending group', () => {
    const c = ctx(3);
    let state = fresh({ partyList: [] }).state;
    state = run(
      state,
      c,
      { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 },
      { type: 'PLACE_ENTITY', name: 'Temerity', r: 0, c: 1 },
    );
    state = begin(state, c, { u1: 10, u2: 7 });
    state = run(
      state,
      c,
      { type: 'DISMISS_TIES' },
      { type: 'REMOVE_UNIT', unitId: unitNamed(state, 'Temerity').id },
    );
    expect(state.turn.pendingTies).toEqual([]);
  });
});
