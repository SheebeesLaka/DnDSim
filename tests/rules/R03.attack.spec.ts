/** R6.1–R6.10: weapon attacks through the pending d20/damage flow. */
import { describe, expect, it } from 'vitest';
import {
  attackTier,
  calculateMargin,
  damageTotal,
  diceForTier,
  weaponDamageBonus,
  ammoCompatible,
} from '../../src/engine/rules/combat.ts';
import { dieMax, formatDiceList } from '../../src/engine/dice.ts';
import { enemy, entity, run, started, step } from '../helpers/combat.ts';

describe('R6.2 margin & tier, R6.3 dice, R6.5 bonus, R6.6 totals (pure math)', () => {
  it.each([
    [1, 0, 12, -11, 0],
    [12, 0, 12, 0, 1],
    [16, 0, 12, 4, 1],
    [17, 0, 12, 5, 2],
    [19, 0, 12, 7, 2],
    [20, 0, 12, 8, 3],
    [10, 5, 10, 5, 2],
    [20, -8, 20, -8, 0], // nat 20 is not an auto-hit
    [1, 30, 10, 21, 3], // nat 1 is not an auto-miss
  ])('d20 %i + mod %i vs AC %i → margin %i tier %i', (d20, mod, ac, margin, tier) => {
    expect(calculateMargin(d20, mod, ac)).toBe(margin);
    expect(attackTier(margin)).toBe(tier);
  });

  it('tiers are cumulative; nulls skipped; short arrays default to d4/d4/d6', () => {
    expect(diceForTier(['d6', 'd6', 'd10'], 1)).toEqual(['d6']);
    expect(diceForTier(['d6', 'd6', 'd10'], 2)).toEqual(['d6', 'd6']);
    expect(diceForTier(['d6', 'd6', 'd10'], 3)).toEqual(['d6', 'd6', 'd10']);
    expect(diceForTier(['d6', null, 'd10'], 3)).toEqual(['d6', 'd10']);
    expect(diceForTier(null, 3)).toEqual(['d4', 'd4', 'd6']);
    expect(diceForTier(['d8'], 3)).toEqual(['d4', 'd4', 'd6']);
    expect(diceForTier(['d6', 'd6', 'd10'], 0)).toEqual([]);
    expect(formatDiceList(['d6', 'd6', 'd10'])).toBe('2d6 + d10');
    expect(formatDiceList([])).toBe('0');
  });

  it.each([
    [5, 3],
    [0, 1],
    [-1, 0],
    [-2, 0],
    [-3, -1],
    [-4, -1],
    [1, 1],
  ])('weapon bonus floorDiv(%i + 2, 2) = %i', (mod, bonus) => expect(weaponDamageBonus(mod)).toBe(bonus));

  it('total: sum → ×1.5 ceil on crit → max(0, +bonus) only when dice were rolled → halve', () => {
    expect(damageTotal([3, 4], { crit: false, bonus: 2, halve: false })).toBe(9);
    expect(damageTotal([3, 4], { crit: true, bonus: 2, halve: false })).toBe(Math.ceil(7 * 1.5) + 2);
    expect(damageTotal([1], { crit: false, bonus: -5, halve: false })).toBe(0);
    expect(damageTotal([], { crit: true, bonus: 5, halve: false })).toBe(0);
    expect(damageTotal([5, 4], { crit: false, bonus: 0, halve: true })).toBe(4);
    expect(damageTotal([3], { crit: true, bonus: 1, halve: true })).toBe(Math.trunc((5 + 1) / 2));
  });

  it('die bounds: unknown strings count as a d6 (F-31)', () => {
    expect([dieMax('d4'), dieMax('d12'), dieMax('d20'), dieMax('2d6'), dieMax(null)]).toEqual([
      4, 12, 20, 6, 6,
    ]);
  });

  it('ammo compatibility: "Any" matches, case-insensitive, legacy field ignored under the flag (F-16)', () => {
    expect(ammoCompatible('12 Gauge', null, '12 gauge', true)).toBe(true);
    expect(ammoCompatible('Any', null, 'Arrow', true)).toBe(true);
    expect(ammoCompatible('Bolt', null, 'Any', true)).toBe(true);
    expect(ammoCompatible('Bolt', null, 'Arrow', true)).toBe(false);
    expect(ammoCompatible(null, '12 Gauge', '12 Gauge', true)).toBe(false);
    expect(ammoCompatible(null, '12 Gauge', '12 Gauge', false)).toBe(true);
    expect(ammoCompatible('Any', null, null, true)).toBe(false); // melee weapon
  });
});

describe('attack flow (ATTACK → SUBMIT_ROLL d20 → damage / confirm)', () => {
  it('hit: tier dice requested, damage applied with bonus, floating text, attacker stays selected', () => {
    const { state, c } = started();
    // Henry (unarmed d4/d4/d4, STR 6) attacks the Spider (AC 12): d20 12 → margin 6 → tier 2
    let s = run(state, c, { type: 'ATTACK', attackerId: 'u1', targetId: 'u4' });
    expect(s.pending).toMatchObject({
      kind: 'd20',
      flow: { flow: 'attack', attackMod: 6, targetAC: 12, damageBonus: 4, weaponDice: ['d4', 'd4', 'd4'] },
    });
    expect(step(s, c, { type: 'MOVE_UNIT', unitId: 'u1', r: 1, c: 0 })).toMatchObject({
      ok: false,
      error: { code: 'pendingInput' },
    });
    s = run(s, c, { type: 'SUBMIT_ROLL', d20: 12 });
    expect(s.pending).toMatchObject({ kind: 'damage', dice: ['d4', 'd4'], tier: 2, d20: 12 });
    expect(step(s, c, { type: 'SUBMIT_ROLL', dice: [4] })).toMatchObject({
      ok: false,
      error: { code: 'invalidRoll' },
    });
    expect(step(s, c, { type: 'SUBMIT_ROLL', dice: [4, 5] })).toMatchObject({
      ok: false,
      error: { message: 'd4 must be 1-4' },
    });
    const res = step(s, c, { type: 'SUBMIT_ROLL', dice: [4, 3] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(enemy(res.state, 'u4').health).toBe(18 - (7 + 4));
    expect(res.events).toContainEqual({
      type: 'floatText',
      unitId: 'u4',
      text: '-11',
      color: '#ff7b6b',
      kind: 'DAMAGE',
    });
    expect(res.state.pending).toBeNull();
  });

  it('natural 20 multiplies the dice sum by 1.5 (ceil) before the bonus and floats gold', () => {
    const { state, c } = started();
    const s = run(
      state,
      c,
      { type: 'ATTACK', attackerId: 'u1', targetId: 'u4' },
      { type: 'SUBMIT_ROLL', d20: 20 },
    );
    expect(s.pending).toMatchObject({ kind: 'damage', tier: 3, dice: ['d4', 'd4', 'd4'] });
    const res = step(s, c, { type: 'SUBMIT_ROLL', dice: [1, 1, 1] });
    expect(res.ok && enemy(res.state, 'u4').health).toBe(18 - (Math.ceil(3 * 1.5) + 4));
    expect(res.events).toContainEqual(expect.objectContaining({ text: '-9', color: '#FFD700' }));
  });

  it('miss: banner, OK resolves (ammo spent), Cancel at the banner spends nothing (R6.9)', () => {
    const { state, c } = started();
    // Dan (shotgun, DEX 5) attacks the Snake (AC 12): d20 3 → margin -4 → miss
    const s = run(
      state,
      c,
      { type: 'ATTACK', attackerId: 'u2', targetId: 'u5' },
      { type: 'SUBMIT_ROLL', d20: 3 },
    );
    expect(s.pending).toMatchObject({ kind: 'confirm', banner: 'MISS' });
    expect(step(s, c, { type: 'SUBMIT_ROLL', dice: [] })).toMatchObject({
      ok: false,
      error: { code: 'wrongInput' },
    });
    const ok = step(s, c, { type: 'CONFIRM_PENDING' });
    expect(ok.ok && entity(ok.state, 'u2').sheet.inventory[0]?.quantity).toBe(1);
    expect(ok.events).toContainEqual(expect.objectContaining({ text: 'Miss' }));
    const cancelled = run(s, c, { type: 'CANCEL_PENDING' });
    expect(entity(cancelled, 'u2').sheet.inventory[0]?.quantity).toBe(2);
    expect(enemy(cancelled, 'u5').health).toBe(14);
  });

  it('ranged: one round consumed per resolved attack, hit or miss; empty stack removed; then "No Ammunition"', () => {
    const { state, c } = started();
    let s = run(
      state,
      c,
      { type: 'ATTACK', attackerId: 'u2', targetId: 'u5' },
      { type: 'SUBMIT_ROLL', d20: 15 },
      { type: 'SUBMIT_ROLL', dice: [1, 1, 1] },
    );
    expect(entity(s, 'u2').sheet.inventory.find((i) => i.kind === 'ammunition')?.quantity).toBe(1);
    s = run(
      s,
      c,
      { type: 'ATTACK', attackerId: 'u2', targetId: 'u5' },
      { type: 'SUBMIT_ROLL', d20: 2 },
      { type: 'CONFIRM_PENDING' },
    );
    expect(entity(s, 'u2').sheet.inventory.some((i) => i.kind === 'ammunition')).toBe(false);
    const res = step(s, c, { type: 'ATTACK', attackerId: 'u2', targetId: 'u5' });
    expect(res).toMatchObject({ ok: false, error: { code: 'noAmmo' } });
    expect(res.events).toContainEqual(
      expect.objectContaining({
        type: 'alert',
        title: 'No Ammunition',
        message: 'No 12 Gauge ammo in inventory!',
      }),
    );
  });

  it('targets: any other entity, enemy or live terrain (same side included); never self or pickups; terrain AC 10', () => {
    const { state, c } = started();
    expect(step(state, c, { type: 'ATTACK', attackerId: 'u4', targetId: 'u5' }).ok).toBe(true); // enemy on enemy
    expect(step(state, c, { type: 'ATTACK', attackerId: 'u1', targetId: 'u2' }).ok).toBe(true); // party on party
    expect(step(state, c, { type: 'ATTACK', attackerId: 'u1', targetId: 'u1' })).toMatchObject({
      ok: false,
      error: { code: 'invalidTarget' },
    });
    const tree = run(state, c, { type: 'ATTACK', attackerId: 'u4', targetId: 'u6' });
    expect(tree.pending).toMatchObject({
      kind: 'd20',
      flow: { attackMod: 4, targetAC: 10, damageBonus: 3, weaponDice: ['d4', 'd4', 'd6'] },
    });
    expect(step(state, c, { type: 'ATTACK', attackerId: 'u3', targetId: 'u99' }).ok).toBe(false);
    const notStarted = step(started().state, c, { type: 'NEXT_TURN' });
    expect(notStarted.ok).toBe(true);
  });

  it('attack modifiers include ATTACK_MODIFIER statuses in both the roll and the bonus (F-11)', () => {
    const { state, c } = started();
    const blessed = {
      ...state,
      units: state.units.map((u) =>
        u.id === 'u1' && u.kind === 'entity'
          ? {
              ...u,
              sheet: {
                ...u.sheet,
                status: [
                  {
                    name: 'Blessed',
                    effectType: 6,
                    magnitude: 2,
                    duration: 10,
                    targetAttribute: -1,
                    extra: {},
                  },
                ],
              },
            }
          : u,
      ),
    };
    const s = run(blessed, c, { type: 'ATTACK', attackerId: 'u1', targetId: 'u4' });
    expect(s.pending).toMatchObject({ flow: { attackMod: 8, damageBonus: 5 } });
  });
});
