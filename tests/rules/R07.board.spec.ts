/** R4.1 grid shapes, R9.2/R9.3 occupancy, R4.3 placement, R9.8 removal. */
import { describe, expect, it } from 'vitest';
import {
  circleMask,
  diamondMask,
  enabledCount,
  maskForShape,
  plusMask,
} from '../../src/engine/rules/gridShapes.ts';
import { canUnitStand, isBlocked, isEnabled, objectAt, unitName } from '../../src/engine/selectors/board.ts';
import { ctx, fresh, grid, run, step, unitNamed } from '../helpers/engine.ts';

const show = (m: boolean[][]) => m.map((row) => row.map((v) => (v ? '#' : '.')).join('')).join('\n');

describe('R4.1 grid shapes (GridShapes.java)', () => {
  it('circle 4x4 keeps the centre-sampled ellipse', () => {
    expect(show(circleMask(4, 4))).toBe(['.##.', '####', '####', '.##.'].join('\n'));
  });
  it('diamond 5x5', () => {
    expect(show(diamondMask(5, 5))).toBe(['..#..', '.###.', '#####', '.###.', '..#..'].join('\n'));
  });
  it('plus uses thickness round(min/3) with Java half-up rounding', () => {
    expect(show(plusMask(5, 5))).toBe(['.##..', '#####', '#####', '.##..', '.##..'].join('\n'));
    expect(show(plusMask(8, 8))).toBe(
      ['..###...', '..###...', '########', '########', '########', '..###...', '..###...', '..###...'].join(
        '\n',
      ),
    );
    // 7/3 = 2.33 → 2 ; 11/3 = 3.67 → 4 ; 1x1 → thickness 1
    expect(plusMask(7, 7)[3]?.every(Boolean)).toBe(true);
    expect(plusMask(1, 1)).toEqual([[true]]);
    expect(enabledCount(plusMask(11, 11), 11, 11)).toBe(4 * 11 + 4 * 11 - 16);
  });
  it('rectangle and custom return null; enabledCount treats null as full', () => {
    expect(maskForShape('RECTANGLE', 3, 4)).toBeNull();
    expect(maskForShape('CUSTOM', 3, 4)).toBeNull();
    expect(enabledCount(null, 3, 4)).toBe(12);
    expect(enabledCount(maskForShape('CIRCLE', 8, 8), 8, 8)).toBe(52);
  });
  it('non-square boards are allowed (1..25 each)', () => {
    const m = circleMask(3, 7);
    expect(m).toHaveLength(3);
    expect(m[0]).toHaveLength(7);
  });
});

describe('R9.3 occupancy and precedence', () => {
  it('getObjectAt precedence: entity > enemy > live terrain > pickup', () => {
    let { state } = fresh({ partyList: [] });
    const c = ctx();
    state = run(state, c, {
      type: 'PLACE_PICKUP',
      itemKind: 'consumable',
      itemName: 'First-Aid Kit',
      r: 1,
      c: 1,
    });
    // force an overlap the UI would prevent, to prove the ranking
    state = run(state, c, { type: 'PLACE_TERRAIN', terrainType: 'Acid', r: 2, c: 2 });
    const acid = unitNamed(state, 'Acid');
    state = run(state, c, { type: 'PLACE_ENEMY', templateStem: 'Spider', r: 2, c: 2 });
    expect(objectAt(state, 2, 2)?.kind).toBe('enemy');
    expect(objectAt(state, 1, 1)?.kind).toBe('pickup');
    expect(objectAt(state, 3, 3)).toBeNull();
    // destroyed terrain is invisible to getObjectAt
    const dead = { ...state, units: state.units.map((u) => (u.id === acid.id ? { ...u, health: 0 } : u)) };
    expect(objectAt(dead, 2, 2)?.kind).toBe('enemy');
    expect(objectAt({ ...dead, units: dead.units.filter((u) => u.kind !== 'enemy') }, 2, 2)).toBeNull();
  });

  it('canUnitStand: enabled & (empty | walk-through terrain); pickups block under the legacy flag (F-15)', () => {
    const mask = Array.from({ length: 4 }, (_, r) =>
      Array.from({ length: 4 }, (_, c) => !(r === 0 && c === 0)),
    );
    let { state } = fresh({ partyList: [] }, grid(4, 4, mask));
    const c = ctx();
    state = run(
      state,
      c,
      { type: 'PLACE_TERRAIN', terrainType: 'Rock', r: 1, c: 1 },
      { type: 'PLACE_TERRAIN', terrainType: 'Acid', r: 1, c: 2 },
      { type: 'PLACE_PICKUP', itemKind: 'weapon', itemName: 'Handaxe', r: 2, c: 2 },
      { type: 'PLACE_ENEMY', templateStem: 'Snake', r: 3, c: 3 },
    );
    expect(isEnabled(state, 0, 0)).toBe(false);
    expect(canUnitStand(state, 0, 0)).toBe(false); // void
    expect(canUnitStand(state, 1, 1)).toBe(false); // rock collides
    expect(canUnitStand(state, 1, 2)).toBe(true); // acid walkable
    expect(canUnitStand(state, 2, 2)).toBe(false); // pickup blocks (legacy)
    expect(canUnitStand(state, 3, 3)).toBe(false); // unit
    expect(canUnitStand(state, 0, 1)).toBe(true);
    expect(canUnitStand(state, -1, 0)).toBe(false);
    const fixed = { ...state, rules: { compat: { ...state.rules.compat, pickupsBlockStanding: false } } };
    expect(canUnitStand(fixed, 2, 2)).toBe(true);
    // isBlocked early-returns the terrain's collision
    expect(isBlocked(state, 1, 2)).toBe(false);
    expect(isBlocked(state, 1, 1)).toBe(true);
    expect(isBlocked(state, 0, 0)).toBe(true);
  });
});

describe('R4.3 placement', () => {
  it('party placement goes in party.json order and gates everything else', () => {
    let { state } = fresh({ partyList: ['Henry Keaton', 'Dan Dixon', 'Nobody'] });
    const c = ctx();
    expect(state.turn.placementQueue).toEqual(['Henry Keaton', 'Dan Dixon']);
    expect(step(state, c, { type: 'PLACE_ENTITY', name: 'Dan Dixon', r: 0, c: 0 }).ok).toBe(false);
    expect(step(state, c, { type: 'PLACE_ENEMY', templateStem: 'Spider', r: 0, c: 0 })).toMatchObject({
      ok: false,
      error: { code: 'placementPhase' },
    });
    expect(step(state, c, { type: 'BEGIN_BATTLE' }).ok).toBe(false);
    state = run(state, c, { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 });
    expect(state.turn.placementQueue).toEqual(['Dan Dixon']);
    const occupied = step(state, c, { type: 'PLACE_ENTITY', name: 'Dan Dixon', r: 0, c: 0 });
    expect(occupied.ok).toBe(false);
    expect(occupied.events).toContainEqual(expect.objectContaining({ type: 'floatText', text: 'Occupied' }));
    state = run(state, c, { type: 'PLACE_ENTITY', name: 'Dan Dixon', r: 0, c: 1 });
    expect(state.turn.placementQueue).toEqual([]);
    expect(state.turn.order).toEqual(['u1', 'u2']);
    // the same character cannot be placed twice; others can be added via Add Objects afterwards
    expect(step(state, c, { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 5, c: 5 })).toMatchObject({
      ok: false,
      error: { code: 'alreadyOnField' },
    });
    state = run(state, c, { type: 'PLACE_ENTITY', name: 'Temerity', r: 5, c: 5 });
    expect(state.units).toHaveLength(3);
  });

  it('entities carry a battle copy of their sheet with equipped weapons resolved by name (R15.3)', () => {
    let { state } = fresh({ partyList: [] });
    const c = ctx();
    state = run(state, c, { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 });
    const henry = unitNamed(state, 'Henry Keaton');
    expect(henry.kind).toBe('entity');
    if (henry.kind !== 'entity') return;
    expect(henry.sheet).not.toBe(c.assets.party['Henry Keaton']);
    expect(henry.sheet.weapons[1]?.name).toBe('Sledgehammer');
    expect(henry.sheet.weapons[1]).toEqual(c.assets.weapons.Sledgehammer);
    expect(henry.acAdjustment).toBe(0);
    expect(henry.diceOverride).toEqual([null, null, null]);
  });

  it('enemies get per-template instance numbers and names `Base #N`; preview d20 pre-battle (R8.2)', () => {
    let { state } = fresh({ partyList: [] });
    const c = ctx(7);
    state = run(
      state,
      c,
      { type: 'PLACE_ENEMY', templateStem: 'Spider', r: 0, c: 0 },
      { type: 'PLACE_ENEMY', templateStem: 'Spider', r: 0, c: 1 },
      { type: 'PLACE_ENEMY', templateStem: '___', r: 0, c: 2 },
    );
    expect(state.units.map(unitName)).toEqual(['Spider #1', 'Spider #2', '??? #1']);
    expect(Object.keys(state.turn.initiative)).toHaveLength(3);
    const res = step(state, c, { type: 'PLACE_ENEMY', templateStem: 'Snake', r: 0, c: 3 });
    expect(
      res.ok &&
        res.events.some((e) => e.type === 'floatText' && /^d20 \d+$/.test(e.text) && e.kind === 'INITIATIVE'),
    ).toBe(true);
    // the roster is kept sorted by the preview totals (highest first)
    const totals = state.turn.order.map((id) => state.turn.initiative[id]?.total ?? 0);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    // with the flag off, no roll happens before Begin
    let { state: s2 } = fresh({ partyList: [], compat: { preBattleEnemyPlacementResorts: false } });
    s2 = run(s2, ctx(7), { type: 'PLACE_ENEMY', templateStem: 'Spider', r: 0, c: 0 });
    expect(s2.turn.initiative).toEqual({});
  });

  it('terrain and pickups need an empty enabled tile; units may share walk-through terrain', () => {
    let { state } = fresh({ partyList: [] });
    const c = ctx();
    state = run(state, c, { type: 'PLACE_TERRAIN', terrainType: 'Red Flower', r: 1, c: 1 });
    expect(
      step(state, c, { type: 'PLACE_PICKUP', itemKind: 'accessory', itemName: 'Plasmoid Core', r: 1, c: 1 }),
    ).toMatchObject({ ok: false, error: { code: 'occupied' } });
    expect(step(state, c, { type: 'PLACE_TERRAIN', terrainType: 'Rock', r: 1, c: 1 })).toMatchObject({
      ok: false,
      error: { code: 'occupied' },
    });
    state = run(state, c, { type: 'PLACE_ENEMY', templateStem: 'Snake', r: 1, c: 1 });
    expect(state.units.filter((u) => u.r === 1 && u.c === 1)).toHaveLength(2);
    expect(step(state, c, { type: 'PLACE_TERRAIN', terrainType: 'Nope', r: 2, c: 2 })).toMatchObject({
      ok: false,
      error: { code: 'unknownTerrain' },
    });
    expect(
      step(state, c, { type: 'PLACE_PICKUP', itemKind: 'weapon', itemName: 'Nope', r: 2, c: 2 }),
    ).toMatchObject({ ok: false, error: { code: 'unknownItem' } });
    expect(step(state, c, { type: 'PLACE_ENEMY', templateStem: 'Nope', r: 2, c: 2 })).toMatchObject({
      ok: false,
      error: { code: 'unknownEnemy' },
    });
    expect(step(state, c, { type: 'PLACE_ENEMY', templateStem: 'Snake', r: 9, c: 9 })).toMatchObject({
      ok: false,
      error: { code: 'outOfBounds' },
    });
    const terrain = unitNamed(state, 'Red Flower');
    expect(
      terrain.kind === 'terrain' && terrain.collision === false && terrain.entityAboveTerrain === false,
    ).toBe(true);
    const pickup = run(state, c, {
      type: 'PLACE_PICKUP',
      itemKind: 'consumable',
      itemName: 'First-Aid Kit',
      r: 3,
      c: 3,
    }).units.at(-1);
    expect(
      pickup?.kind === 'pickup' && pickup.item.kind === 'consumable' && pickup.item.name === 'First-Aid Kit',
    ).toBe(true);
  });

  it('SET_GRID only on an empty, unstarted board', () => {
    let { state } = fresh({ partyList: [] });
    const c = ctx();
    state = run(state, c, { type: 'SET_GRID', setup: grid(3, 5, maskForShape('DIAMOND', 3, 5), 'grass') });
    expect(state.board).toMatchObject({ rows: 3, cols: 5, theme: 'grass' });
    expect(state.board.elevation).toHaveLength(3);
    state = run(state, c, { type: 'PLACE_ENEMY', templateStem: 'Snake', r: 1, c: 2 });
    expect(step(state, c, { type: 'SET_GRID', setup: grid(2, 2) })).toMatchObject({
      ok: false,
      error: { code: 'boardNotEmpty' },
    });
  });
});

describe('R9.8 removal', () => {
  it('REMOVE_UNIT drops units and turn-order entries; party entities go to the graveyard', () => {
    let { state } = fresh({ partyList: [] });
    const c = ctx();
    state = run(
      state,
      c,
      { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 },
      { type: 'PLACE_ENEMY', templateStem: 'Spider', r: 0, c: 1 },
      { type: 'PLACE_TERRAIN', terrainType: 'Rock', r: 2, c: 2 },
    );
    const spider = unitNamed(state, 'Spider #1');
    const res = step(state, c, { type: 'REMOVE_UNIT', unitId: spider.id });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.units.map(unitName)).toEqual(['Henry Keaton', 'Rock']);
    expect(res.state.turn.order).toEqual(['u1']);
    expect(res.state.turn.initiative[spider.id]).toBeUndefined();
    expect(res.events).toContainEqual({ type: 'unitRemoved', unitId: spider.id, reason: 'deleted' });
    const gone = run(res.state, c, { type: 'REMOVE_UNIT', unitId: 'u1' });
    expect(gone.graveyard.map((e) => e.sheet.name)).toEqual(['Henry Keaton']);
    expect(step(gone, c, { type: 'REMOVE_UNIT', unitId: 'u1' })).toMatchObject({
      ok: false,
      error: { code: 'unknownUnit' },
    });
  });

  it('unknown commands and reduce purity: failed commands leave the state untouched', () => {
    const { state } = fresh({ partyList: [] });
    const res = step(state, ctx(), { type: 'NOPE' } as never);
    expect(res).toMatchObject({ ok: false, error: { code: 'unknownCommand' } });
    expect(res.state).toBe(state);
  });
});
