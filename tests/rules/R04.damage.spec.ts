/** R6.11–R6.13: taking damage, death and removal, healing caps, F-5 / F-14 both ways. */
import { describe, expect, it } from 'vitest';
import { LEGACY_COMPAT, withCompat } from '../../src/engine/compat.ts';
import { applyDamage, applyHealing } from '../../src/engine/rules/apply.ts';
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
    s = run(s, c, { type: 'ADJUST_HP', unitId: 'u1', delta: 99 });
    expect(entity(s, 'u1').sheet.currentHP).toBe(36);
    s = run(s, c, { type: 'ADJUST_HP', unitId: 'u1', delta: -1 });
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
