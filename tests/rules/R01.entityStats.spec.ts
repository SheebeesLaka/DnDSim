/** R5.1–R5.11: CharSheet / Entity derived values. Formulas quote FEATURES.md. */
import { describe, expect, it } from 'vitest';
import { StatusEffect } from '../../src/assets/types.ts';
import * as S from '../../src/engine/selectors/stats.ts';
import type { EntityUnit } from '../../src/engine/types.ts';
import { ctx, fresh, mutateUnit, run, status, unitNamed } from '../helpers/engine.ts';

function henry() {
  const c = ctx();
  const state = run(fresh({ partyList: [] }).state, c, {
    type: 'PLACE_ENTITY',
    name: 'Henry Keaton',
    r: 0,
    c: 0,
  });
  return { state, c, id: unitNamed(state, 'Henry Keaton').id };
}
const ent = (s: ReturnType<typeof henry>['state'], id: string) =>
  s.units.find((u) => u.id === id) as EntityUnit;

describe('R5.3 attribute totals', () => {
  it('total = base + equipment (accessories + primary weapon only) + status mods; adjusted adds the battle tweak', () => {
    const { state, id } = henry();
    // Henry: base [6,2,7,2,7,3], Sledgehammer in the SECONDARY slot (+1 STR +1 CON) -> not counted (F-29)
    expect(S.totalAttributes(ent(state, id).sheet)).toEqual([6, 2, 7, 2, 7, 3]);
    const swapped = mutateUnit<EntityUnit>(state, id, (e) => {
      e.sheet.weapons = [e.sheet.weapons[1], null];
    });
    expect(S.totalAttributes(ent(swapped, id).sheet)).toEqual([7, 2, 8, 2, 7, 3]);
    const withStatus = mutateUnit<EntityUnit>(swapped, id, (e) => {
      e.sheet.status.push(
        status('Weak', StatusEffect.STAT_MODIFIER, -3, 2, 0),
        status('Nimble', StatusEffect.MOVEMENT_MODIFIER, 2, 2, 1),
      );
      e.statAdjustment = [1, 0, 0, 0, 0, -2];
    });
    expect(S.totalAttributes(ent(withStatus, id).sheet)).toEqual([4, 4, 8, 2, 7, 3]);
    expect(S.adjustedAttribute(ent(withStatus, id), 0)).toBe(5);
    expect(S.adjustedAttribute(ent(withStatus, id), 5)).toBe(1);
    expect(S.adjustedAttribute(ent(withStatus, id), 9)).toBe(0);
  });
});

describe('R5.4 AC, R5.5 attack, R5.6 movement, R5.7–R5.9 initiative/saves/casting', () => {
  it('AC = armorClass + Σ accessory defense + Σ AC_MODIFIER + acAdjustment', () => {
    const { state, id } = henry();
    expect(S.entityAC(ent(state, id))).toBe(14);
    const s2 = mutateUnit<EntityUnit>(state, id, (e) => {
      e.sheet.accessories[0] = {
        kind: 'accessory',
        name: 'Core',
        type: 'Accessory',
        color: '#000',
        quantity: 1,
        defense: 1,
        modifiedAttributes: [0, 0, 0, 0, 0, 0],
        abilities: [],
        legacyArmorType: 0,
        extra: {},
      };
      e.sheet.status.push(
        status('Shield of Faith', StatusEffect.AC_MODIFIER, 2, 10),
        status('Illuminated', StatusEffect.AC_MODIFIER, -2, 2),
      );
      e.acAdjustment = -3;
    });
    expect(S.entityAC(ent(s2, id))).toBe(14 + 1 + 2 - 2 - 3);
  });

  it('attack modifier uses the primary weapon stat (unarmed: STR) + ATTACK_MODIFIER statuses', () => {
    const { state, id } = henry();
    expect(S.entityAttackModifier(ent(state, id))).toBe(6); // unarmed -> STR 6
    const armed = mutateUnit<EntityUnit>(state, id, (e) => {
      e.sheet.weapons = [{ ...e.sheet.weapons[1]!, statType: 'DEXTERITY' }, null];
      e.sheet.status.push(status('Blessed', StatusEffect.ATTACK_MODIFIER, 2, 10));
    });
    expect(S.entityAttackModifier(ent(armed, id))).toBe(2 + 2);
    const weird = mutateUnit<EntityUnit>(armed, id, (e) => {
      e.sheet.weapons[0]!.statType = 'LUCK';
    });
    expect(S.entityAttackModifier(ent(weird, id))).toBe(7 + 2); // unknown stat -> STR (now 7 with the +1 STR weapon)
  });

  it.each([
    [2, 0, 2], // 1 + trunc(3/2)=1 ... DEX 2 -> 1 + 1 = 2
    [5, 0, 4],
    [0, 0, 1],
    [-2, 0, 1], // trunc((-2+1)/2) = trunc(-0.5) = 0
    [-3, 0, 0], // trunc(-1) = -1 -> 1 - 1 = 0
    [-9, 0, 0], // clamps at 0
    [4, -2, 1],
    [4, -99, 0],
  ])(
    'movement with DEX %i and movement status %i = %i (R5.6, Java int division)',
    (dex, moveMod, expected) => {
      const { state, id } = henry();
      const s = mutateUnit<EntityUnit>(state, id, (e) => {
        e.sheet.baseAttributes[1] = dex;
        if (moveMod) e.sheet.status.push(status('Chilled', StatusEffect.MOVEMENT_MODIFIER, moveMod, 2, -1));
      });
      expect(S.entityMovement(ent(s, id))).toBe(expected);
    },
  );

  it('movement statuses tied to an attribute change that attribute, not movement (F-12)', () => {
    const { state, id } = henry();
    const s = mutateUnit<EntityUnit>(state, id, (e) => {
      e.sheet.status.push(status('Haste', StatusEffect.MOVEMENT_MODIFIER, 4, 2, 1));
    });
    expect(S.adjustedAttribute(ent(s, id), 1)).toBe(6);
    expect(S.entityMovement(ent(s, id))).toBe(1 + Math.trunc(7 / 2));
  });

  it('initiative = adjusted DEX; saves = adjusted stat; casting from the casting stat; DC = 10 + casting', () => {
    const c = ctx();
    const state = run(fresh({ partyList: [] }).state, c, {
      type: 'PLACE_ENTITY',
      name: 'Grand Wizard Man',
      r: 0,
      c: 0,
    });
    const gw = ent(state, 'u1');
    expect(S.initiativeModifier(gw)).toBe(12);
    expect(S.entitySaveModifier(gw, 4)).toBe(11);
    expect(S.entityCastingModifier(gw)).toBe(11);
    expect(S.entitySpellSaveDC(gw)).toBe(21);
    const blessed = mutateUnit<EntityUnit>(state, 'u1', (e) => {
      e.sheet.status.push(status('Blessed', StatusEffect.ATTACK_MODIFIER, 2, 10));
      e.statAdjustment[3] = 1;
    });
    expect(S.entitySpellAttackModifier(ent(blessed, 'u1'))).toBe(12 + 2);
    expect(S.entityCastingModifier(ent(blessed, 'u1'))).toBe(12);
    expect(S.entitySpellSaveDC(ent(blessed, 'u1'))).toBe(22);
    const { state: h, id } = henry();
    expect(S.entityCastingModifier(ent(h, id))).toBe(0); // not a caster
    expect(S.spellAttackModifier(ent(h, id))).toBe(0);
  });
});

describe('R5.10 damage dice', () => {
  it('unarmed is d4/d4/d4; per-tier overrides win; swap clears nothing by itself', () => {
    const { state, id } = henry();
    expect(S.entityDamageDice(ent(state, id))).toEqual(['d4', 'd4', 'd4']);
    const armed = mutateUnit<EntityUnit>(state, id, (e) => {
      e.sheet.weapons = [e.sheet.weapons[1], null];
      e.diceOverride = [null, 'd12', null];
    });
    expect(S.entityBaseDamageDice(ent(armed, id))).toEqual(['d6', 'd6', 'd10']);
    expect(S.entityDamageDice(ent(armed, id))).toEqual(['d6', 'd12', 'd10']);
  });
  it('polymorphic helpers: health, maxHealth, isDead, statTypeName', () => {
    const { state, id } = henry();
    const e = ent(state, id);
    expect([S.health(e), S.maxHealth(e), S.isDead(e)]).toEqual([20, 36, false]);
    expect(S.statTypeName(e)).toBe('STRENGTH');
    expect(S.casterLevel(e)).toBe(1);
  });
});
