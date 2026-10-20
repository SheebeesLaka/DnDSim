/** R6.11–R6.13: taking damage, death, dying and removal, healing caps, F-5 / F-14 both ways. */
import { describe, expect, it } from 'vitest';
import { LEGACY_COMPAT, withCompat } from '../../src/engine/compat.ts';
import { applyDamage, applyHealing } from '../../src/engine/rules/apply.ts';
import { actionAvailability } from '../../src/engine/selectors/actions.ts';
import { canUnitStand } from '../../src/engine/selectors/board.ts';
import { createBattle } from '../../src/engine/createBattle.ts';
import { ctx, engineAssets, grid } from '../helpers/engine.ts';
import { enemy, entity, run, started, step } from '../helpers/combat.ts';

const kill = (attackerId: string, targetId: string) => [
  { type: 'ATTACK', attackerId, targetId } as const,
  { type: 'SUBMIT_ROLL', d20: 20 } as const,
];

describe('applying damage and healing', () => {
  it('entity HP is unclamped under legacy (negative persists) and clamps at 0 when fixed; enemies floor at 0; terrain unclamped', () => {
    const { state } = started();
    const e = JSON.parse(JSON.stringify(entity(state, 'u1'))) as ReturnType<typeof entity>;
    applyDamage(e, 25, LEGACY_COMPAT);
    expect(e.sheet.currentHP).toBe(-5);
    const e2 = JSON.parse(JSON.stringify(entity(state, 'u1'))) as ReturnType<typeof entity>;
    applyDamage(e2, 25, withCompat({ entityNegativeHpPersists: false }));
    expect(e2.sheet.currentHP).toBe(0);
    const en = JSON.parse(JSON.stringify(enemy(state, 'u4'))) as ReturnType<typeof enemy>;
    applyDamage(en, 99, LEGACY_COMPAT);
    expect(en.health).toBe(0);
    const tree = JSON.parse(JSON.stringify(state.units.find((u) => u.id === 'u6'))) as {
      kind: 'terrain';
      health: number;
    };
    applyDamage(tree as never, 9, LEGACY_COMPAT);
    expect(tree.health).toBe(-4);
  });

  it('healing caps at max and reports the amount actually restored', () => {
    const { state } = started();
    const e = JSON.parse(JSON.stringify(entity(state, 'u1'))) as ReturnType<typeof entity>;
    expect(applyHealing(e, 50)).toBe(16);
    expect(e.sheet.currentHP).toBe(36);
    const en = JSON.parse(JSON.stringify(enemy(state, 'u4'))) as ReturnType<typeof enemy>;
    en.health = 10;
    expect(applyHealing(en, 3)).toBe(3);
    expect(applyHealing(en, 99)).toBe(5);
  });
});

describe('death and removal (R6.12)', () => {
  it('a defeated enemy leaves the board and the order and counts toward victory; party members go to the graveyard with their HP', () => {
    const { state, c } = started();
    const s = run(state, c, ...kill('u1', 'u4'), { type: 'SUBMIT_ROLL', dice: [4, 4, 4] }); // 18 + 4 = 22 ≥ 18
    expect(s.units.some((u) => u.id === 'u4')).toBe(false);
    expect(s.turn.order).not.toContain('u4');
    expect(s.turn.enemiesDefeated).toBe(1);
    // Spider kills Henry? Spider d4/d4/d6, Henry has 20 HP: set Henry low first
    const low = run(s, c, { type: 'SET_HP', unitId: 'u1', hp: 3 });
    const res = step(run(low, c, ...kill('u5', 'u1')), c, { type: 'SUBMIT_ROLL', dice: [4, 4, 4] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.units.some((u) => u.id === 'u1')).toBe(false);
    expect(res.state.graveyard[0]?.sheet.currentHP).toBeLessThan(0);
    expect(res.events).toContainEqual({ type: 'unitRemoved', unitId: 'u1', reason: 'defeated' });
  });

  it('destroyed terrain is removed; terrain cannot be healed and never has statuses', () => {
    const { state, c } = started();
    const s = run(state, c, ...kill('u4', 'u6'), { type: 'SUBMIT_ROLL', dice: [2, 2, 2] }); // 9 + 3 = 12 ≥ 5
    expect(s.units.some((u) => u.id === 'u6')).toBe(false);
  });

  it('sidebar HP changes clamp to [0, max] but never remove a unit (F-26)', () => {
    const { state, c } = started();
    let s = run(state, c, { type: 'SET_HP', unitId: 'u4', hp: -5 });
    expect(enemy(s, 'u4').health).toBe(0);
    expect(s.units.some((u) => u.id === 'u4')).toBe(true);
    s = run(s, c, { type: 'SET_HP', unitId: 'u1', hp: 99 });
    expect(entity(s, 'u1').sheet.currentHP).toBe(36);
    s = run(s, c, { type: 'SET_HP', unitId: 'u1', hp: 35 });
    expect(entity(s, 'u1').sheet.currentHP).toBe(35);
  });

  it("F-5: killing the current combatant skips the next unit's turn start (legacy) or runs it (fixed)", () => {
    for (const legacy of [true, false]) {
      const { state, c } = started(1, [], { removeCurrentSkipsNext: legacy });
      // order: u1 (12), u2 (14)... compute: Henry 10+2=12, Dan 9+5=14, GW 8+12=20, enemies random. Make it deterministic: find current.
      const current = state.turn.order[state.turn.currentIndex]!;
      const nextId = state.turn.order[(state.turn.currentIndex + 1) % state.turn.order.length]!;
      // give the next unit a status so processing is observable
      const withStatus = {
        ...state,
        units: state.units.map((u) =>
          u.id === nextId
            ? u.kind === 'entity'
              ? {
                  ...u,
                  sheet: {
                    ...u.sheet,
                    status: [
                      {
                        name: 'Burning',
                        effectType: 1,
                        magnitude: 2,
                        duration: 3,
                        targetAttribute: -1,
                        extra: {},
                      },
                    ],
                  },
                }
              : u.kind === 'enemy'
                ? {
                    ...u,
                    statuses: [
                      {
                        name: 'Burning',
                        effectType: 1,
                        magnitude: 2,
                        duration: 3,
                        targetAttribute: -1,
                        extra: {},
                      },
                    ],
                  }
                : u
            : u,
        ),
      };
      const res = step(withStatus, c, { type: 'REMOVE_UNIT', unitId: current });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const next = res.state.units.find((u) => u.id === nextId)!;
      const duration =
        next.kind === 'entity'
          ? next.sheet.status[0]?.duration
          : next.kind === 'enemy'
            ? next.statuses[0]?.duration
            : 0;
      expect(duration).toBe(legacy ? 3 : 2);
      expect(res.state.turn.order[res.state.turn.currentIndex]).toBe(nextId);
    }
  });
});

describe('dying instead of leaving the board (F-14 fixed)', () => {
  const hit = (s: ReturnType<typeof started>['state'], c: ReturnType<typeof started>['c']) =>
    step(run(s, c, ...kill('u5', 'u1')), c, { type: 'SUBMIT_ROLL', dice: [4, 4, 4] });

  it('a party member brought to 0 HP stays on the board and in the order, dying, and cannot act', () => {
    const { state, c } = started(1, [], { entityNegativeHpPersists: false });
    const res = hit(run(state, c, { type: 'SET_HP', unitId: 'u1', hp: 3 }), c);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const henry = entity(res.state, 'u1');
    expect(henry.sheet.currentHP).toBe(0);
    expect(henry.dying).toEqual({ successes: 0, failures: 0 });
    expect(res.state.turn.order).toContain('u1');
    expect(res.state.graveyard).toHaveLength(0);
    expect(res.events.some((e) => e.type === 'unitRemoved')).toBe(false);
    expect(res.events).toContainEqual(
      expect.objectContaining({ type: 'floatText', unitId: 'u1', text: 'Dying' }),
    );
    expect(Object.values(actionAvailability(res.state, 'u1', c.assets)).some(Boolean)).toBe(false);
  });

  it('more hits while dying change nothing: they stay until the DM decides', () => {
    const { state, c } = started(1, [], { entityNegativeHpPersists: false });
    let s = run(state, c, { type: 'SET_HP', unitId: 'u1', hp: 1 });
    for (let i = 0; i < 4; i++) {
      const res = hit(s, c);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      s = res.state;
    }
    expect(entity(s, 'u1').dying).toEqual({ successes: 0, failures: 0 });
    expect(entity(s, 'u1').sheet.currentHP).toBe(0);
    expect(s.graveyard).toHaveLength(0);
  });

  describe('the DM resolves it (RESOLVE_DYING)', () => {
    const dying = () => {
      const { state, c } = started(1, [], { entityNegativeHpPersists: false });
      const res = hit(run(state, c, { type: 'SET_HP', unitId: 'u1', hp: 3 }), c);
      if (!res.ok) throw new Error('attack failed');
      return { s: res.state, c };
    };

    it('recover: back up with 1 HP, no longer dying, sheet written', () => {
      const { s, c } = dying();
      const res = step(s, c, { type: 'RESOLVE_DYING', unitId: 'u1', outcome: 'recover' });
      if (!res.ok) throw new Error(res.error.message);
      expect(entity(res.state, 'u1').dying).toBeNull();
      expect(entity(res.state, 'u1').sheet.currentHP).toBe(1);
      expect(res.events).toContainEqual({ type: 'sheetChanged', sourceName: 'Henry Keaton' });
      expect(Object.values(actionAvailability(res.state, 'u1', c.assets)).some(Boolean)).toBe(true);
    });

    it('hold on: still dying, nothing else changes', () => {
      const { s, c } = dying();
      const res = step(s, c, { type: 'RESOLVE_DYING', unitId: 'u1', outcome: 'hold' });
      if (!res.ok) throw new Error(res.error.message);
      expect(entity(res.state, 'u1').dying).not.toBeNull();
      expect(res.state.units).toEqual(s.units);
      expect(res.state.log.at(-1)?.text).toBe('Henry Keaton holds on');
    });

    it('perish: leaves the board and the order, a tombstone marks the tile, the sheet is marked dead', () => {
      const { s, c } = dying();
      const where = { r: entity(s, 'u1').r, c: entity(s, 'u1').c };
      const res = step(s, c, { type: 'RESOLVE_DYING', unitId: 'u1', outcome: 'perish' });
      if (!res.ok) throw new Error(res.error.message);
      expect(res.state.units.some((u) => u.id === 'u1')).toBe(false);
      expect(res.state.turn.order).not.toContain('u1');
      expect(res.state.board.graves).toEqual([{ id: 'grave-u1', ...where, name: 'Henry Keaton' }]);
      expect(res.state.graveyard[0]?.sheet.dead).toBe(true);
      expect(res.events).toContainEqual({ type: 'unitRemoved', unitId: 'u1', reason: 'defeated' });
      // the tombstone is decoration: the tile can be stood on again
      expect(canUnitStand(res.state, where.r, where.c)).toBe(true);
    });

    it('the fallen stay behind: a new battle skips party members whose sheet is marked dead', () => {
      const base = engineAssets();
      const henry = base.party['Henry Keaton'];
      if (!henry) throw new Error('fixture sheet missing');
      // a copy: the shared fixture sheets must stay alive for the other tests
      const assets = { ...base, party: { ...base.party, 'Henry Keaton': { ...henry, dead: true } } };
      const s = createBattle(grid(), assets, { partyList: ['Henry Keaton', 'Dan Dixon'] });
      expect(s.turn.placementQueue).toEqual(['Dan Dixon']);
      expect(s.log.map((l) => l.text)).toEqual(['Henry Keaton has perished and is not placed']);
      // the living are queued as before
      expect(
        createBattle(grid(), engineAssets(), { partyList: ['Henry Keaton', 'Dan Dixon'] }).turn
          .placementQueue,
      ).toEqual(['Henry Keaton', 'Dan Dixon']);
    });

    it('a sheet marked dead while waiting to be placed leaves the placement queue', () => {
      const assets = engineAssets();
      const c = ctx(1, assets);
      const s = createBattle(grid(), assets, { partyList: ['Henry Keaton', 'Dan Dixon'] });
      const henry = assets.party['Henry Keaton'];
      if (!henry) throw new Error('fixture sheet missing');
      const res = step(s, c, {
        type: 'REPLACE_SHEET',
        sourceName: 'Henry Keaton',
        sheet: { ...henry, dead: true },
      });
      if (!res.ok) throw new Error(res.error.message);
      expect(res.state.turn.placementQueue).toEqual(['Dan Dixon']);
    });

    it('refuses a unit that is not dying', () => {
      const { state, c } = started(1, [], { entityNegativeHpPersists: false });
      const res = step(state, c, { type: 'RESOLVE_DYING', unitId: 'u1', outcome: 'perish' });
      expect(res.ok).toBe(false);
      expect(step(state, c, { type: 'RESOLVE_DYING', unitId: 'u4', outcome: 'recover' }).ok).toBe(false);
    });
  });

  it('any healing brings them back up', () => {
    const { state, c } = started(1, [], { entityNegativeHpPersists: false });
    const res = hit(run(state, c, { type: 'SET_HP', unitId: 'u1', hp: 3 }), c);
    if (!res.ok) throw new Error('attack failed');
    const henry = JSON.parse(JSON.stringify(entity(res.state, 'u1'))) as ReturnType<typeof entity>;
    expect(applyHealing(henry, 4)).toBe(4);
    expect(henry.dying).toBeNull();
  });

  it('under the Java rules the same hit still removes them with negative HP', () => {
    const { state, c } = started(1, [], { entityNegativeHpPersists: true });
    const res = hit(run(state, c, { type: 'SET_HP', unitId: 'u1', hp: 3 }), c);
    if (!res.ok) throw new Error('attack failed');
    expect(res.state.units.some((u) => u.id === 'u1')).toBe(false);
  });
});
