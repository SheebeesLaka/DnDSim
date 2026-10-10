/** R10 elevation foundations, lights, groups, ambient, reveal, theme: state only, zero rule effect. */
import { describe, expect, it } from 'vitest';
import { computeLighting, lightLevelAt, unitsInDarkness } from '../../src/engine/selectors/lighting.ts';
import { canUnitStand, objectAt } from '../../src/engine/selectors/board.ts';
import { seededRng } from '../../src/engine/rng.ts';
import type { BattleState, Command } from '../../src/engine/types.ts';
import { ctx, fresh, run, step, unitNamed } from '../helpers/engine.ts';

describe('elevation / altitude / ramps (R10 foundations)', () => {
  it('accepts any integer, negatives included, and works on void cells (F-23)', () => {
    let { state } = fresh({ partyList: [] });
    const c = ctx();
    state = run(
      state,
      c,
      { type: 'SET_ELEVATION', r: 0, c: 0, level: 5 },
      { type: 'ADJUST_ELEVATION', r: 0, c: 0, delta: -7 },
      { type: 'ADJUST_ELEVATION', r: 1, c: 1, delta: 3 },
    );
    expect(state.board.elevation[0]?.[0]).toBe(-2);
    expect(state.board.elevation[1]?.[1]).toBe(3);
    expect(step(state, c, { type: 'SET_ELEVATION', r: 9, c: 9, level: 1 })).toMatchObject({
      ok: false,
      error: { code: 'outOfBounds' },
    });
    state = run(state, c, { type: 'SET_RAMP', r: 2, c: 2, ramp: { r: 2, c: 2, from: 1, to: 0, dir: 'S' } });
    expect(state.board.ramps).toHaveLength(1);
    state = run(state, c, { type: 'SET_RAMP', r: 2, c: 2, ramp: null });
    expect(state.board.ramps).toHaveLength(0);
  });

  it('altitude is per unit and clamps at 0', () => {
    let { state } = fresh({ partyList: [] });
    const c = ctx();
    state = run(state, c, { type: 'PLACE_ENEMY', templateStem: 'Overgrown Hornet', r: 0, c: 0 });
    const id = state.units[0]?.id ?? '';
    expect(run(state, c, { type: 'SET_ALTITUDE', unitId: id, altitude: 3 }).units[0]?.altitude).toBe(3);
    expect(run(state, c, { type: 'SET_ALTITUDE', unitId: id, altitude: -2 }).units[0]?.altitude).toBe(0);
    expect(step(state, c, { type: 'SET_ALTITUDE', unitId: 'nope', altitude: 1 }).ok).toBe(false);
  });
});

describe('lights, groups, ambient, reveal, theme', () => {
  it('CRUD + toggles', () => {
    let { state } = fresh({ partyList: [] });
    const c = ctx();
    state = run(
      state,
      c,
      { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 3, c: 3 },
      {
        type: 'ADD_LIGHT',
        light: {
          id: 'lamp',
          name: 'Lamp',
          brightRadius: 2,
          dimRadius: 4,
          color: '#ffe3b0',
          at: { r: 0, c: 0 },
          on: true,
        },
      },
      {
        type: 'ADD_LIGHT',
        light: {
          name: 'Torch',
          brightRadius: 1,
          dimRadius: 2,
          color: '#ffb366',
          attachedTo: 'u1',
          on: true,
          groupId: 'party',
        },
      },
      { type: 'SET_LIGHT_GROUP', group: { id: 'party', name: 'Party lights', on: true } },
    );
    expect(state.board.lights.map((l) => l.id)).toEqual(['lamp', 'light2']);
    expect(
      step(state, c, {
        type: 'ADD_LIGHT',
        light: { id: 'lamp', name: 'dup', brightRadius: 1, dimRadius: 1, color: '#fff', on: true },
      }),
    ).toMatchObject({ ok: false, error: { code: 'duplicateLight' } });
    expect(
      step(state, c, {
        type: 'ADD_LIGHT',
        light: { name: 'x', brightRadius: 1, dimRadius: 1, color: '#fff', on: true, attachedTo: 'zzz' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'unknownUnit' } });
    state = run(state, c, { type: 'TOGGLE_LIGHT', lightId: 'lamp' });
    expect(state.board.lights[0]?.on).toBe(false);
    state = run(
      state,
      c,
      { type: 'TOGGLE_LIGHT', lightId: 'lamp', on: true },
      { type: 'UPDATE_LIGHT', lightId: 'lamp', patch: { brightRadius: 3, color: '#ffffff' } },
    );
    expect(state.board.lights[0]).toMatchObject({ on: true, brightRadius: 3, color: '#ffffff' });
    state = run(state, c, { type: 'TOGGLE_LIGHT_GROUP', groupId: 'party' });
    expect(state.board.lightGroups[0]?.on).toBe(false);
    expect(step(state, c, { type: 'TOGGLE_LIGHT_GROUP', groupId: 'nope' }).ok).toBe(false);
    state = run(state, c, { type: 'REMOVE_LIGHT', lightId: 'lamp' });
    expect(state.board.lights).toHaveLength(1);
    expect(step(state, c, { type: 'REMOVE_LIGHT', lightId: 'lamp' }).ok).toBe(false);
    state = run(
      state,
      c,
      { type: 'SET_AMBIENT', level: 'dark' },
      { type: 'SET_DM_REVEAL', on: false },
      { type: 'SET_THEME', theme: ' Grass ' },
    );
    expect(state.board).toMatchObject({ ambient: 'dark', dmReveal: false, theme: 'grass' });
    expect(run(state, c, { type: 'SET_THEME', theme: '' }).board.theme).toBe('stone');
  });

  it('light levels: radii, walls, higher terrain, groups, ambient floor', () => {
    let { state } = fresh({ partyList: [] }, { rows: 1, cols: 10, mask: null, theme: 'stone' });
    const c = ctx();
    state = run(
      state,
      c,
      { type: 'SET_AMBIENT', level: 'dark' },
      {
        type: 'ADD_LIGHT',
        light: {
          id: 'L',
          name: 'L',
          brightRadius: 2,
          dimRadius: 4,
          color: '#fff',
          at: { r: 0, c: 0 },
          on: true,
          groupId: 'g',
        },
      },
      { type: 'SET_LIGHT_GROUP', group: { id: 'g', name: 'g', on: true } },
    );
    const levels = (s: BattleState) =>
      Array.from({ length: 10 }, (_, i) => lightLevelAt(computeLighting(s), 0, i)[0]).join('');
    expect(levels(state)).toBe('bbbdddkkkk'.replace(/k/g, 'd').slice(0, 5) + 'ddddd');
    expect(levels(state)).toBe('bbbdddddd d'.replace(/ /g, '').slice(0, 10));
    // explicit: bright at 0..2, dim at 3..4, dark beyond
    expect(Array.from({ length: 10 }, (_, i) => lightLevelAt(computeLighting(state), 0, i))).toEqual([
      'bright',
      'bright',
      'bright',
      'dim',
      'dim',
      'dark',
      'dark',
      'dark',
      'dark',
      'dark',
    ]);
    // a wall (Rock, collides → blocksLight) at 1 shadows everything behind it
    const walled = run(state, c, { type: 'PLACE_TERRAIN', terrainType: 'Rock', r: 0, c: 1 });
    expect(Array.from({ length: 5 }, (_, i) => lightLevelAt(computeLighting(walled), 0, i))).toEqual([
      'bright',
      'dark',
      'dark',
      'dark',
      'dark',
    ]);
    const seeThrough = run(walled, c, {
      type: 'SET_TERRAIN_BLOCKS_LIGHT',
      unitId: walled.units[0]?.id ?? '',
      blocksLight: false,
    });
    expect(lightLevelAt(computeLighting(seeThrough), 0, 2)).toBe('bright');
    // higher terrain between the light (elev 1 = on the floor) and a lower target blocks it
    const cliff = run(state, c, { type: 'SET_ELEVATION', r: 0, c: 1, level: 2 });
    expect(lightLevelAt(computeLighting(cliff), 0, 1)).toBe('bright'); // the cliff top itself is lit
    expect(lightLevelAt(computeLighting(cliff), 0, 2)).toBe('dark'); // behind it, no
    // group off = light off; light off wins over group on; ambient dim floor
    expect(
      lightLevelAt(computeLighting(run(state, c, { type: 'TOGGLE_LIGHT_GROUP', groupId: 'g' })), 0, 0),
    ).toBe('dark');
    expect(lightLevelAt(computeLighting(run(state, c, { type: 'TOGGLE_LIGHT', lightId: 'L' })), 0, 0)).toBe(
      'dark',
    );
    expect(lightLevelAt(computeLighting(run(state, c, { type: 'SET_AMBIENT', level: 'dim' })), 0, 9)).toBe(
      'dim',
    );
  });

  it('attached lights follow their unit and die with it; unitsInDarkness lists hidden units', () => {
    let { state } = fresh({ partyList: [] }, { rows: 1, cols: 8, mask: null, theme: 'stone' });
    const c = ctx();
    state = run(
      state,
      c,
      { type: 'SET_AMBIENT', level: 'dark' },
      { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 },
      { type: 'PLACE_ENEMY', templateStem: 'Snake', r: 0, c: 7 },
      {
        type: 'ADD_LIGHT',
        light: {
          id: 'T',
          name: 'Torch',
          brightRadius: 1,
          dimRadius: 2,
          color: '#fff',
          attachedTo: 'u1',
          on: true,
        },
      },
    );
    expect(lightLevelAt(computeLighting(state), 0, 1)).toBe('bright');
    expect([...unitsInDarkness(state)]).toEqual(['u2']);
    const moved = { ...state, units: state.units.map((u) => (u.id === 'u1' ? { ...u, c: 5 } : u)) };
    expect(lightLevelAt(computeLighting(moved), 0, 1)).toBe('dark');
    expect(lightLevelAt(computeLighting(moved), 0, 7)).toBe('dim');
    const removed = run(state, c, { type: 'REMOVE_UNIT', unitId: 'u1' });
    expect(lightLevelAt(computeLighting(removed), 0, 1)).toBe('dark');
  });
});

describe('invariance: visual state never changes combat-relevant facts', () => {
  it('randomised elevation/altitude/lights leave occupancy, order and stats identical', () => {
    let { state } = fresh({ partyList: [] });
    const c = ctx(3);
    state = run(
      state,
      c,
      { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 },
      { type: 'PLACE_ENEMY', templateStem: 'Spider', r: 2, c: 2 },
      { type: 'PLACE_TERRAIN', terrainType: 'Rock', r: 1, c: 1 },
    );
    const rng = seededRng(99);
    const noise: Command[] = [];
    for (let i = 0; i < 40; i++) {
      noise.push({ type: 'SET_ELEVATION', r: rng.int(0, 7), c: rng.int(0, 7), level: rng.int(-4, 8) });
    }
    noise.push(
      { type: 'SET_ALTITUDE', unitId: 'u2', altitude: 3 },
      { type: 'SET_AMBIENT', level: 'dark' },
      { type: 'SET_DM_REVEAL', on: false },
      { type: 'SET_THEME', theme: 'dirt' },
    );
    noise.push({
      type: 'ADD_LIGHT',
      light: { name: 'x', brightRadius: 1, dimRadius: 3, color: '#fff', at: { r: 4, c: 4 }, on: true },
    });
    const noisy = run(state, c, ...noise);
    const facts = (s: BattleState) => ({
      occupancy: Array.from({ length: 64 }, (_, i) => [
        objectAt(s, Math.floor(i / 8), i % 8)?.id ?? null,
        canUnitStand(s, Math.floor(i / 8), i % 8),
      ]),
      order: s.turn.order,
      initiative: s.turn.initiative,
      units: s.units.map((u) => ({ ...u, altitude: 0 })),
    });
    expect(facts(noisy)).toEqual(facts(state));
    expect(unitNamed(noisy, 'Spider #1').altitude).toBe(3);
  });
});
