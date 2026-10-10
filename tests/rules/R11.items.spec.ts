/** R6.14 consumables, R6.15 swap, R9.6 pickup, R9.1 movement, sidebar adjustments (§3.1). */
import { describe, expect, it } from 'vitest';
import { moveTargets, actionAvailability } from '../../src/engine/selectors/actions.ts';
import { enemy, entity, run, started, step } from '../helpers/combat.ts';
import { combatAssets } from '../helpers/combat.ts';

describe('R9.1 movement', () => {
  it('teleports within Manhattan MOB to a standable cell; refuses farther, blocked, or own cell', () => {
    const { state, c } = started();
    // Henry DEX 2 → MOB 1 + trunc(3/2) = 2
    expect(
      moveTargets(state, entity(state, 'u1'))
        .map((x) => `${x.r},${x.c}`)
        .sort(),
    ).toEqual(['1,0', '1,1', '2,0'].sort());
    const res = step(state, c, { type: 'MOVE_UNIT', unitId: 'u1', r: 2, c: 0 });
    expect(res.ok && entity(res.state, 'u1').r).toBe(2);
    expect(res.events).toContainEqual({
      type: 'unitMoved',
      unitId: 'u1',
      from: { r: 0, c: 0 },
      to: { r: 2, c: 0 },
    });
    expect(step(state, c, { type: 'MOVE_UNIT', unitId: 'u1', r: 3, c: 0 })).toMatchObject({
      ok: false,
      error: { code: 'outOfRange' },
    });
    expect(step(state, c, { type: 'MOVE_UNIT', unitId: 'u1', r: 0, c: 1 })).toMatchObject({
      ok: false,
      error: { code: 'occupied' },
    });
    expect(step(state, c, { type: 'MOVE_UNIT', unitId: 'u1', r: 0, c: 0 })).toMatchObject({
      ok: false,
      error: { code: 'occupied' },
    });
    // Spider MOB 7 ignores everything in between (no pathing)
    expect(step(state, c, { type: 'MOVE_UNIT', unitId: 'u4', r: 7, c: 6 }).ok).toBe(true);
    expect(step(state, c, { type: 'MOVE_UNIT', unitId: 'u6', r: 7, c: 6 })).toMatchObject({
      ok: false,
      error: { code: 'notActor' },
    });
  });
});

describe('R6.14 consumables', () => {
  it('d10 efficacy: heal = ceil(amount × roll × 10 / 100), capped; quantity decrements and the item disappears at 0', () => {
    const { state, c } = started();
    let s = run(
      state,
      c,
      { type: 'SET_HP', unitId: 'u2', hp: 1 },
      { type: 'USE_CONSUMABLE', unitId: 'u2', itemName: 'First-Aid Kit' },
    );
    expect(s.pending).toMatchObject({ kind: 'd10Efficacy', healAmount: 25 });
    expect(step(s, c, { type: 'SUBMIT_ROLL', d10: 11 })).toMatchObject({
      ok: false,
      error: { code: 'invalidRoll' },
    });
    const res = step(s, c, { type: 'SUBMIT_ROLL', d10: 3 });
    expect(res.ok && entity(res.state, 'u2').sheet.currentHP).toBe(1 + Math.ceil((25 * 30) / 100));
    expect(res.events).toContainEqual(expect.objectContaining({ text: '+8', kind: 'HEAL' }));
    s = res.ok ? res.state : s;
    expect(entity(s, 'u2').sheet.inventory.find((i) => i.kind === 'consumable')?.quantity).toBe(1);
    s = run(
      s,
      c,
      { type: 'USE_CONSUMABLE', unitId: 'u2', itemName: 'First-Aid Kit' },
      { type: 'SUBMIT_ROLL', d10: 10 },
    );
    expect(entity(s, 'u2').sheet.currentHP).toBe(30); // capped at 30
    expect(entity(s, 'u2').sheet.inventory.some((i) => i.kind === 'consumable')).toBe(false);
    const none = step(s, c, { type: 'USE_CONSUMABLE', unitId: 'u2', itemName: 'First-Aid Kit' });
    expect(none).toMatchObject({ ok: false, error: { code: 'noItems' } });
    expect(none.events).toContainEqual(expect.objectContaining({ title: 'No Items' }));
    expect(step(state, c, { type: 'USE_CONSUMABLE', unitId: 'u4', itemName: 'x' })).toMatchObject({
      ok: false,
      error: { code: 'notParty' },
    });
    // cancel at the d10 prompt consumes nothing
    const cancelled = run(
      state,
      c,
      { type: 'USE_CONSUMABLE', unitId: 'u2', itemName: 'First-Aid Kit' },
      { type: 'CANCEL_PENDING' },
    );
    expect(entity(cancelled, 'u2').sheet.inventory.find((i) => i.kind === 'consumable')?.quantity).toBe(2);
  });
});

describe('R9.6 pickup', () => {
  it('adjacent (Chebyshev ≤ 1) pickups stack into the inventory by name and kind; the tile is freed', () => {
    const { state, c } = started(1, [
      { type: 'PLACE_PICKUP', itemKind: 'consumable', itemName: 'First-Aid Kit', r: 1, c: 2 },
      { type: 'PLACE_PICKUP', itemKind: 'weapon', itemName: 'Handaxe', r: 2, c: 2 },
    ]);
    const res = step(state, c, { type: 'PICKUP', unitId: 'u2', r: 1, c: 2 }); // Dan at (0,1): diagonal
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(entity(res.state, 'u2').sheet.inventory.find((i) => i.kind === 'consumable')?.quantity).toBe(3);
    expect(res.state.units.some((u) => u.kind === 'pickup' && u.r === 1 && u.c === 2)).toBe(false);
    expect(res.events).toContainEqual(expect.objectContaining({ type: 'unitRemoved', reason: 'pickedUp' }));
    expect(step(res.state, c, { type: 'PICKUP', unitId: 'u2', r: 2, c: 2 })).toMatchObject({
      ok: false,
      error: { code: 'outOfRange' },
    });
    const far = run(
      res.state,
      c,
      { type: 'MOVE_UNIT', unitId: 'u2', r: 1, c: 1 },
      { type: 'PICKUP', unitId: 'u2', r: 2, c: 2 },
    );
    expect(entity(far, 'u2').sheet.inventory.some((i) => i.name === 'Handaxe')).toBe(true);
    expect(step(far, c, { type: 'PICKUP', unitId: 'u2', r: 5, c: 5 })).toMatchObject({
      ok: false,
      error: { code: 'noPickup' },
    });
  });
});

describe('sidebar adjustments (§3.1)', () => {
  it('AC/stat/dice tweaks are battle-only; enemies only take DEX; dice cycle d4…d20 clamped; swap clears overrides', () => {
    const { state, c } = started();
    let s = run(
      state,
      c,
      { type: 'ADJUST_AC', unitId: 'u4', delta: 2 },
      { type: 'ADJUST_STAT', unitId: 'u4', attribute: 1, delta: 3 },
      { type: 'ADJUST_STAT', unitId: 'u4', attribute: 0, delta: 3 },
    );
    expect(enemy(s, 'u4')).toMatchObject({ acAdjustment: 2, dexAdjustment: 3 });
    s = run(s, c, { type: 'ADJUST_STAT', unitId: 'u1', attribute: 3, delta: -2 });
    expect(entity(s, 'u1').statAdjustment).toEqual([0, 0, 0, -2, 0, 0]);
    s = run(
      s,
      c,
      { type: 'ADJUST_DICE', unitId: 'u1', tier: 0, direction: 1 },
      { type: 'ADJUST_DICE', unitId: 'u1', tier: 2, direction: -1 },
    );
    expect(entity(s, 'u1').diceOverride).toEqual(['d6', null, 'd4']);
    for (let i = 0; i < 9; i++) s = run(s, c, { type: 'ADJUST_DICE', unitId: 'u1', tier: 0, direction: 1 });
    expect(entity(s, 'u1').diceOverride[0]).toBe('d20');
    // null tier cycles from d4 (F-27)
    const nullTier = {
      ...s,
      units: s.units.map((u) =>
        u.id === 'u1' && u.kind === 'entity'
          ? {
              ...u,
              sheet: {
                ...u.sheet,
                weapons: [
                  { ...u.sheet.weapons[1]!, damageDice: ['d8', null, null] as [string, null, null] },
                  null,
                ] as typeof u.sheet.weapons,
              },
              diceOverride: [null, null, null] as typeof u.diceOverride,
            }
          : u,
      ),
    };
    expect(
      entity(run(nullTier, c, { type: 'ADJUST_DICE', unitId: 'u1', tier: 1, direction: 1 }), 'u1')
        .diceOverride[1],
    ).toBe('d6');
    // swap: primary <-> secondary, overrides cleared, attributes resynced (sledgehammer +1 STR +1 CON)
    const swapped = run(s, c, { type: 'SWAP_WEAPON', unitId: 'u1' });
    expect(entity(swapped, 'u1').sheet.weapons[0]?.name).toBe('Sledgehammer');
    expect(entity(swapped, 'u1').diceOverride).toEqual([null, null, null]);
    expect(entity(swapped, 'u1').sheet.totalAttributes).toEqual([7, 2, 8, 2, 7, 3]);
    expect(step(s, c, { type: 'SWAP_WEAPON', unitId: 'u4' })).toMatchObject({
      ok: false,
      error: { code: 'notParty' },
    });
    expect(step(s, c, { type: 'ADJUST_DICE', unitId: 'u1', tier: 3, direction: 1 })).toMatchObject({
      ok: false,
      error: { code: 'badTier' },
    });
  });

  it('action availability mirrors R3.1', () => {
    const { state, c } = started();
    const assets = combatAssets();
    expect(actionAvailability(state, 'u1', assets)).toEqual({
      move: true,
      attack: true,
      useItem: true,
      pickup: true,
      cast: false,
      swap: true,
    });
    expect(actionAvailability(state, 'u3', assets).cast).toBe(true);
    expect(actionAvailability(state, 'u4', assets)).toEqual({
      move: true,
      attack: true,
      useItem: false,
      pickup: false,
      cast: false,
      swap: false,
    });
    expect(actionAvailability(state, 'u6', assets).move).toBe(false);
    expect(actionAvailability(state, null, assets).attack).toBe(false);
    const pending = run(state, c, { type: 'ATTACK', attackerId: 'u1', targetId: 'u4' });
    expect(actionAvailability(pending, 'u1', assets).move).toBe(false);
  });
});
