/** R5.12–R5.14: Enemy formulas. */
import { describe, expect, it } from 'vitest';
import { StatusEffect } from '../../src/assets/types.ts';
import * as S from '../../src/engine/selectors/stats.ts';
import type { EnemyUnit } from '../../src/engine/types.ts';
import { ctx, fresh, mutateUnit, run, status } from '../helpers/engine.ts';

function spider(stem = 'Spider') {
  const c = ctx();
  const state = run(fresh({ partyList: [] }).state, c, {
    type: 'PLACE_ENEMY',
    templateStem: stem,
    r: 0,
    c: 0,
  });
  return { state, c, en: state.units[0] as EnemyUnit };
}
const en = (s: { units: unknown[] }) => s.units[0] as EnemyUnit;

describe('enemy derived values', () => {
  it('AC: armorClass (≤0 reads as 10) + acAdjustment + Σ AC_MODIFIER', () => {
    const { state } = spider();
    expect(S.enemyAC(en(state))).toBe(12);
    const tweaked = mutateUnit<EnemyUnit>(state, 'u1', (e) => {
      e.acAdjustment = 2;
      e.statuses.push(status('Illuminated', StatusEffect.AC_MODIFIER, -2, 2));
    });
    expect(S.enemyAC(en(tweaked))).toBe(12);
    const legacy = mutateUnit<EnemyUnit>(state, 'u1', (e) => {
      e.armorClass = 0;
    });
    expect(S.enemyAC(en(legacy))).toBe(10);
    expect(S.enemyAC(en(mutateUnit<EnemyUnit>(state, 'u1', (e) => void (e.armorClass = -5))))).toBe(10);
  });

  it('attack = dexterity + dexAdjustment + Σ ATTACK_MODIFIER; initiative = dexterity + dexAdjustment', () => {
    const { state } = spider();
    expect(S.enemyAttackModifier(en(state))).toBe(4);
    const s = mutateUnit<EnemyUnit>(state, 'u1', (e) => {
      e.dexAdjustment = 3;
      e.statuses.push(status('Blessed', StatusEffect.ATTACK_MODIFIER, 2, 10));
    });
    expect(S.enemyAttackModifier(en(s))).toBe(9);
    expect(S.enemyInitiative(en(s))).toBe(7);
    expect(S.initiativeModifier(en(s))).toBe(7);
  });

  it('movement = max(0, mobility + flat MOVEMENT_MODIFIER); DEX tweaks never change it', () => {
    const { state } = spider();
    expect(S.enemyMovement(en(state))).toBe(7);
    const s = mutateUnit<EnemyUnit>(state, 'u1', (e) => {
      e.dexAdjustment = 10;
      e.statuses.push(
        status('Held', StatusEffect.MOVEMENT_MODIFIER, -99, 2, -1),
        status('Haste?', StatusEffect.MOVEMENT_MODIFIER, 5, 2, 1),
      );
    });
    expect(S.enemyMovement(en(s))).toBe(0);
  });

  it('saves: DEX slot is the dexterity field; missing attributes default to dexterity; STAT_MODIFIER statuses only', () => {
    const { state } = spider(); // Spider has no attributes array
    expect([0, 1, 2, 3, 4, 5].map((i) => S.enemySaveModifier(en(state), i))).toEqual([4, 4, 4, 4, 4, 4]);
    const { state: snake } = spider('Snake'); // attributes all 7, dexterity 7
    const s = mutateUnit<EnemyUnit>(snake, 'u1', (e) => {
      e.attributes = [1, 99, 3, 4, 5, 6];
      e.dexAdjustment = 1;
      e.statuses.push(
        status('Weak', StatusEffect.STAT_MODIFIER, -2, 2, 0),
        status('Slow', StatusEffect.MOVEMENT_MODIFIER, -2, 2, 0),
      );
    });
    expect(S.enemySaveModifier(en(s), 0)).toBe(1 - 2); // movement-tied status ignored for enemies (F-12)
    expect(S.enemySaveModifier(en(s), 1)).toBe(7 + 1); // dexterity field, not attributes[1]
    expect(S.enemySaveModifier(en(s), 5)).toBe(6);
    expect(S.enemyAttribute(en(s), 1)).toBe(7);
  });

  it('dice: template dice with per-tier overrides; defaults d4/d4/d6', () => {
    const { state } = spider();
    expect(S.enemyDamageDice(en(state))).toEqual(['d4', 'd4', 'd6']);
    const s = mutateUnit<EnemyUnit>(state, 'u1', (e) => void (e.diceOverride = ['d20', null, null]));
    expect(S.enemyDamageDice(en(s))).toEqual(['d20', 'd4', 'd6']);
    expect(S.baseDamageDice(en(s))).toEqual(['d4', 'd4', 'd6']);
  });

  it('polymorphic casters: enemies use their attack modifier for spell math and count as level 1', () => {
    const { state } = spider();
    expect(S.spellAttackModifier(en(state))).toBe(4);
    expect(S.spellSaveDC(en(state))).toBe(14);
    expect(S.castingModifier(en(state))).toBe(4);
    expect(S.casterLevel(en(state))).toBe(1);
    expect(S.statTypeName(en(state))).toBe('STRENGTH'); // F-9
    expect([S.health(en(state)), S.maxHealth(en(state)), S.isDead(en(state))]).toEqual([18, 18, false]);
  });
});
