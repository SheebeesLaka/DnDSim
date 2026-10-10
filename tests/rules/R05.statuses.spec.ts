/** R5.16 item abilities, R7.11–R7.15 statuses, F-1/F-4/F-8/F-28 behaviours both ways. */
import { describe, expect, it } from 'vitest';
import { StatusEffect } from '../../src/assets/types.ts';
import { LEGACY_COMPAT, withCompat } from '../../src/engine/compat.ts';
import {
  applyStatus,
  procEnemyStatus,
  procEntityStatus,
  processEquippedAbilities,
  tickStatus,
  turnStartProcessing,
} from '../../src/engine/rules/statuses.ts';
import type { EnemyUnit, EntityUnit } from '../../src/engine/types.ts';
import { ability, ctx, fresh, run, status } from '../helpers/engine.ts';

function units() {
  const c = ctx();
  const state = run(
    fresh({ partyList: [] }).state,
    c,
    { type: 'PLACE_ENTITY', name: 'NMB-15', r: 0, c: 0 },
    { type: 'PLACE_ENEMY', templateStem: 'Snake', r: 1, c: 1 },
  );
  const e = JSON.parse(JSON.stringify(state.units[0])) as EntityUnit; // NMB-15: Plasmoid Core REGEN heal 2, 18/24 HP
  const en = JSON.parse(JSON.stringify(state.units[1])) as EnemyUnit;
  return { e, en };
}

describe('Status.tick (R7.12 / F-8)', () => {
  it('counts down from >0 and expires at 0; -1 is permanent; 0 never expires under legacy', () => {
    const s = status('x', 0, 0, 2);
    expect(tickStatus(s, LEGACY_COMPAT)).toBe(false);
    expect(tickStatus(s, LEGACY_COMPAT)).toBe(true);
    expect(tickStatus(status('p', 0, 0, -1), LEGACY_COMPAT)).toBe(false);
    expect(tickStatus(status('z', 0, 0, 0), LEGACY_COMPAT)).toBe(false);
    expect(tickStatus(status('z', 0, 0, 0), withCompat({ durationZeroNeverExpires: false }))).toBe(true);
  });
});

describe('item abilities (R5.16)', () => {
  it('HEAL heals min(magnitude, missing) and does nothing at full HP; DAMAGE floors at 1; STATUS adds a 1-turn NONE status once; STAT_BOOST no-op', () => {
    const { e } = units();
    const sheet = e.sheet;
    expect(processEquippedAbilities(sheet, 'ON_TURN_START')).toEqual(['Plasmoid Core: Healed 2 HP']);
    expect(sheet.currentHP).toBe(20);
    sheet.currentHP = 23;
    expect(processEquippedAbilities(sheet, 'ON_TURN_START')).toEqual(['Plasmoid Core: Healed 1 HP']);
    expect(processEquippedAbilities(sheet, 'ON_TURN_START')).toEqual([]);
    sheet.abilities.push(
      ability('DAMAGE', 50, { name: 'Curse' }),
      ability('STATUS', 0, { name: 'Mark', statusName: 'Marked' }),
      ability('STAT_BOOST', 3, { name: 'Boost' }),
    );
    expect(processEquippedAbilities(sheet, 'ON_TURN_START')).toEqual([
      'Curse: Took 50 damage',
      'Mark: Applied Marked',
      'Plasmoid Core: Healed 2 HP',
    ]);
    expect(sheet.currentHP).toBe(3);
    expect(sheet.status).toEqual([
      { name: 'Marked', effectType: 0, magnitude: 0, duration: 1, targetAttribute: -1, extra: {} },
    ]);
    processEquippedAbilities(sheet, 'ON_TURN_START');
    expect(sheet.status).toHaveLength(1); // no duplicate names
  });

  it('runs innate, then both weapon slots, then accessories; only the trigger string matters, never the ability type (F-28)', () => {
    const { e } = units();
    const sheet = e.sheet;
    sheet.currentHP = 1;
    sheet.abilities.push(ability('HEAL', 1, { name: 'Innate', abilityType: 'ACTIVE' }));
    sheet.weapons[1] = {
      ...sheet.weapons[0]!,
      name: 'Offhand',
      abilities: [ability('HEAL', 1, { name: 'OffAb' })],
    };
    sheet.weapons[0] = {
      ...sheet.weapons[0]!,
      abilities: [
        ability('HEAL', 1, { name: 'MainAb' }),
        ability('HEAL', 9, { name: 'OnHit', triggerType: 'ON_HIT' }),
      ],
    };
    expect(processEquippedAbilities(sheet, 'ON_TURN_START')).toEqual([
      'Innate: Healed 1 HP',
      "Plasmoid's Fulmen: Healed 1 HP",
      'Offhand: Healed 1 HP',
      'Plasmoid Core: Healed 2 HP',
    ]);
    expect(processEquippedAbilities(sheet, 'ON_HIT')).toEqual(["Plasmoid's Fulmen: Healed 9 HP"]);
  });
});

describe('turn-start processing (R7.12, F-1, F-4)', () => {
  it('entity: DOT floors at 1 and can raise 0/negative HP; HOT caps; expired statuses removed; abilities fire', () => {
    const { e } = units();
    e.sheet.currentHP = 0;
    e.sheet.status.push(
      status('Burning', StatusEffect.DAMAGE_OVER_TIME, 2, 1),
      status('Regen', StatusEffect.HEAL_OVER_TIME, 50, 2),
      status('Held', StatusEffect.MOVEMENT_MODIFIER, -99, 2),
    );
    const msgs = procEntityStatus(e.sheet, LEGACY_COMPAT);
    // DOT: max(1, 0-2) = 1 ; HOT: min(24, 1+50) = 24 ; then REGEN finds full HP -> nothing
    expect(e.sheet.currentHP).toBe(24);
    expect(msgs).toEqual([]);
    expect(e.sheet.status.map((s) => [s.name, s.duration])).toEqual([
      ['Regen', 1],
      ['Held', 1],
    ]);
    expect(e.sheet.totalAttributes).toEqual([2, 7, 3, 7, 5, 3]);
  });

  it('entity with no statuses: procStatus returns early (no ability fire inside it)', () => {
    const { e } = units();
    expect(procEntityStatus(e.sheet, LEGACY_COMPAT)).toEqual([]);
    expect(e.sheet.currentHP).toBe(18);
  });

  it('F-1: REGEN fires twice per turn when any status is present under legacy, once with the flag off', () => {
    const { e } = units();
    e.sheet.status.push(status('Dead', StatusEffect.NONE, 0, -1));
    const legacy = JSON.parse(JSON.stringify(e)) as EntityUnit;
    expect(turnStartProcessing(legacy, LEGACY_COMPAT)).toEqual([
      'Plasmoid Core: Healed 2 HP',
      'Plasmoid Core: Healed 2 HP',
    ]);
    expect(legacy.sheet.currentHP).toBe(22);
    const fixed = JSON.parse(JSON.stringify(e)) as EntityUnit;
    expect(turnStartProcessing(fixed, withCompat({ turnStartAbilitiesDoubleFire: false }))).toEqual([
      'Plasmoid Core: Healed 2 HP',
    ]);
    expect(fixed.sheet.currentHP).toBe(20);
    // without statuses, both settings fire exactly once (from nextTurn's own call)
    const none = units().e;
    expect(turnStartProcessing(none, LEGACY_COMPAT)).toEqual(['Plasmoid Core: Healed 2 HP']);
  });

  it('enemy: DOT floors at 1, HOT caps at max, durations tick, no abilities', () => {
    const { en } = units();
    en.health = 2;
    en.statuses.push(
      status('Burning', StatusEffect.DAMAGE_OVER_TIME, 5, 2),
      status('Chilled', StatusEffect.MOVEMENT_MODIFIER, -2, 1),
    );
    procEnemyStatus(en, LEGACY_COMPAT);
    expect(en.health).toBe(1);
    expect(en.statuses.map((s) => s.name)).toEqual(['Burning']);
    en.statuses.push(status('Mend', StatusEffect.HEAL_OVER_TIME, 99, -1));
    expect(turnStartProcessing(en, LEGACY_COMPAT)).toEqual([]);
    expect(en.health).toBe(14);
    expect(en.statuses.map((s) => s.name)).toEqual(['Mend']);
  });
});

describe('applyStatus (R7.13)', () => {
  it('same name refreshes duration to max(old, new) or permanent; different names stack; entities resync attributes', () => {
    const { e, en } = units();
    expect(applyStatus(en, status('Burning', StatusEffect.DAMAGE_OVER_TIME, 2, 2))).toBe(true);
    applyStatus(en, status('Burning', StatusEffect.DAMAGE_OVER_TIME, 9, 1));
    expect(en.statuses).toEqual([expect.objectContaining({ name: 'Burning', magnitude: 2, duration: 2 })]);
    applyStatus(en, status('Burning', StatusEffect.DAMAGE_OVER_TIME, 2, 5));
    expect(en.statuses[0]?.duration).toBe(5);
    applyStatus(en, status('Burning', StatusEffect.DAMAGE_OVER_TIME, 2, -1));
    expect(en.statuses[0]?.duration).toBe(-1);
    applyStatus(en, status('Burning', StatusEffect.DAMAGE_OVER_TIME, 2, 3));
    expect(en.statuses[0]?.duration).toBe(-1); // permanent stays permanent
    applyStatus(e, status('Weak', StatusEffect.STAT_MODIFIER, -2, 3, 0));
    expect(e.sheet.totalAttributes[0]).toBe(0);
    const given = status('X', 0, 0, 1);
    applyStatus(e, given);
    expect(e.sheet.status.at(-1)).not.toBe(given); // fresh copy per target
  });
});
