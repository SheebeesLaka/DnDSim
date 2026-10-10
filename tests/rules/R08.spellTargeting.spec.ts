/** R7.2–R7.6: who can cast, slots, target validity, range, self-resolve. */
import { describe, expect, it } from 'vitest';
import {
  lowestAvailableSlot,
  maxSlotsForLevel,
  spellSlotsRemaining,
} from '../../src/engine/rules/spellSlots.ts';
import { isHostile, isInRange, isValidSpellTarget } from '../../src/engine/rules/targeting.ts';
import { castableSpells, spellTargets } from '../../src/engine/selectors/actions.ts';
import { combatAssets, entity, started, step } from '../helpers/combat.ts';

const assets = combatAssets();
const spell = (name: string) => assets.spells[name]!;

describe('R7.3 slots (5e full-caster table)', () => {
  it.each([
    [1, 1, 2],
    [1, 2, 0],
    [3, 2, 2],
    [5, 3, 2],
    [9, 5, 1],
    [12, 6, 1],
    [17, 9, 1],
    [20, 7, 2],
    [25, 9, 1],
    [0, 1, 2],
    [4, 0, 0],
    [4, 10, 0],
  ])('level %i spell level %i → %i slots', (lvl, sl, n) => expect(maxSlotsForLevel(lvl, sl)).toBe(n));

  it('non-casters have no slots; remaining = max − used; lowestAvailableSlot climbs', () => {
    const { state } = started();
    const gw = entity(state, 'u3').sheet; // level 12 INT caster
    expect(spellSlotsRemaining(gw, 1)).toBe(4);
    expect(spellSlotsRemaining({ ...gw, spellSlotsUsed: [4, 3, 3, 3, 2, 1, 0, 0, 0] }, 1)).toBe(0);
    expect(lowestAvailableSlot({ ...gw, spellSlotsUsed: [4, 3, 0, 0, 0, 0, 0, 0, 0] }, 1)).toBe(3);
    expect(lowestAvailableSlot({ ...gw, spellSlotsUsed: [4, 3, 3, 3, 2, 1, 0, 0, 0] }, 1)).toBe(-1);
    expect(lowestAvailableSlot(gw, 0)).toBe(0);
    expect(spellSlotsRemaining(entity(state, 'u1').sheet, 1)).toBe(0);
  });

  it('castableSpells: cantrips or a slot ≥ level; a non-caster knowing a cantrip is still "castable" (F-33)', () => {
    const { state } = started();
    expect(castableSpells(entity(state, 'u3'), assets)).toHaveLength(16);
    const tapped = {
      ...entity(state, 'u3'),
      sheet: { ...entity(state, 'u3').sheet, spellSlotsUsed: [4, 3, 3, 3, 2, 1, 0, 0, 0] },
    };
    expect(castableSpells(tapped, assets).map((s) => s.name)).toEqual([
      'Fire Bolt',
      'Ray of Frost',
      'Sacred Flame',
      'Thunderclap',
    ]);
    const henry = {
      ...entity(state, 'u1'),
      sheet: { ...entity(state, 'u1').sheet, knownSpells: ['Fire Bolt'] },
    };
    expect(castableSpells(henry, assets)).toHaveLength(1);
  });
});

describe('R7.4 target validity and R7.5 range', () => {
  it('SELF only the caster; ANY any unit; ALLY non-hostile incl. self; ENEMY hostile and not self; terrain only for ATTACK/AUTO non-ALLY', () => {
    const { state } = started();
    const gw = entity(state, 'u3'),
      henry = entity(state, 'u1'),
      spider = state.units.find((u) => u.id === 'u4')!,
      tree = state.units.find((u) => u.id === 'u6')!;
    const self = { ...spell('Bless'), targetType: 'SELF' as const };
    expect(isValidSpellTarget(gw, gw, self)).toBe(true);
    expect(isValidSpellTarget(gw, henry, self)).toBe(false);
    expect(isValidSpellTarget(gw, henry, spell('Bless'))).toBe(true); // ALLY
    expect(isValidSpellTarget(gw, gw, spell('Bless'))).toBe(true);
    expect(isValidSpellTarget(gw, spider, spell('Bless'))).toBe(false);
    expect(isValidSpellTarget(gw, spider, spell('Fire Bolt'))).toBe(true); // ENEMY
    expect(isValidSpellTarget(gw, henry, spell('Fire Bolt'))).toBe(false);
    expect(isValidSpellTarget(gw, gw, { ...spell('Fire Bolt'), targetType: 'ANY' })).toBe(true);
    expect(isValidSpellTarget(gw, tree, spell('Fire Bolt'))).toBe(true);
    expect(isValidSpellTarget(gw, tree, spell('Magic Missile'))).toBe(true);
    expect(isValidSpellTarget(gw, tree, spell('Sacred Flame'))).toBe(false); // SAVE
    expect(isValidSpellTarget(gw, tree, { ...spell('Fire Bolt'), targetType: 'ALLY' })).toBe(false);
    expect(isValidSpellTarget(gw, null, spell('Fire Bolt'))).toBe(false);
    expect(isHostile(gw, spider)).toBe(true);
    expect(isHostile(henry, gw)).toBe(false);
  });

  it('range is Manhattan ≤ max(1, range); self always in range; the selector flags out-of-range targets', () => {
    const { state } = started();
    const gw = entity(state, 'u3'); // at (0,2)
    const spider = state.units.find((u) => u.id === 'u4')!; // (3,3) → distance 4
    expect(isInRange(gw, spider, 4)).toBe(true);
    expect(isInRange(gw, spider, 3)).toBe(false);
    expect(isInRange(gw, spider, 0)).toBe(false);
    expect(isInRange(gw, gw, 0)).toBe(true);
    const targets = spellTargets(state, 'u3', spell('Cure Wounds')); // touch (1): Dan at (0,1) in range, Henry at (0,0) not
    expect(targets.map((t) => [t.unit.id, t.inRange])).toEqual([
      ['u1', false],
      ['u2', true],
      ['u3', true],
    ]);
  });
});

describe('CAST_SPELL validation', () => {
  it('rejects non-casters, unknown spells, missing slots, bad targets; floats "Out of range"', () => {
    const { state, c } = started();
    const noSpells = step(state, c, {
      type: 'CAST_SPELL',
      casterId: 'u1',
      spellName: 'Fire Bolt',
      slotLevel: 0,
      targetId: 'u4',
    });
    expect(noSpells).toMatchObject({ ok: false, error: { code: 'noSpells' } });
    expect(noSpells.events).toContainEqual(expect.objectContaining({ type: 'alert', title: 'No Spells' }));
    expect(
      step(state, c, { type: 'CAST_SPELL', casterId: 'u3', spellName: 'Wish', slotLevel: 9, targetId: 'u4' }),
    ).toMatchObject({ ok: false, error: { code: 'unknownSpell' } });
    expect(
      step(state, c, {
        type: 'CAST_SPELL',
        casterId: 'u3',
        spellName: 'Fire Bolt',
        slotLevel: 1,
        targetId: 'u4',
      }),
    ).toMatchObject({ ok: false, error: { code: 'noSlot' } });
    expect(
      step(state, c, {
        type: 'CAST_SPELL',
        casterId: 'u3',
        spellName: 'Fireball',
        slotLevel: 2,
        aim: { r: 3, c: 3 },
      }),
    ).toMatchObject({ ok: false, error: { code: 'noSlot' } });
    expect(
      step(state, c, {
        type: 'CAST_SPELL',
        casterId: 'u3',
        spellName: 'Fireball',
        slotLevel: 7,
        aim: { r: 3, c: 3 },
      }),
    ).toMatchObject({ ok: false, error: { code: 'noSlot' } });
    expect(
      step(state, c, {
        type: 'CAST_SPELL',
        casterId: 'u3',
        spellName: 'Fire Bolt',
        slotLevel: 0,
        targetId: 'u1',
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalidTarget' } });
    const far = step(state, c, {
      type: 'CAST_SPELL',
      casterId: 'u3',
      spellName: 'Cure Wounds',
      slotLevel: 1,
      targetId: 'u1',
    });
    expect(far).toMatchObject({ ok: false, error: { code: 'outOfRange' } });
    expect(far.events).toContainEqual(expect.objectContaining({ text: 'Out of range' }));
    expect(
      step(state, c, {
        type: 'CAST_SPELL',
        casterId: 'u4',
        spellName: 'Fire Bolt',
        slotLevel: 0,
        targetId: 'u1',
      }),
    ).toMatchObject({ ok: false, error: { code: 'notParty' } });
    expect(
      step(state, c, { type: 'CAST_SPELL', casterId: 'u3', spellName: 'Fire Bolt', slotLevel: 0 }),
    ).toMatchObject({ ok: false, error: { code: 'needTarget' } });
  });

  it('R7.6 / F-13: a range-0 non-area spell resolves on the caster under legacy even with targetType ENEMY', () => {
    const custom = combatAssets();
    custom.spells['Zap'] = { ...custom.spells['Fire Bolt']!, name: 'Zap', range: 0 };
    custom.party['Grand Wizard Man']!.knownSpells.push('Zap');
    for (const legacy of [true, false]) {
      const { state, c } = started(1, [], { rangeZeroResolvesOnCaster: legacy }, custom);
      const res = step(state, c, {
        type: 'CAST_SPELL',
        casterId: 'u3',
        spellName: 'Zap',
        slotLevel: 0,
        targetId: 'u4',
      });
      if (legacy)
        expect(res.ok && res.state.pending).toMatchObject({ kind: 'd20', flow: { targetId: 'u3' } });
      else expect(res).toMatchObject({ ok: false, error: { code: 'outOfRange' } }); // Spider is 4 away; range 0 → touch
      const selfSpell = step(state, c, {
        type: 'CAST_SPELL',
        casterId: 'u3',
        spellName: 'Shield of Faith',
        slotLevel: 1,
        targetId: 'u3',
      });
      expect(selfSpell.ok).toBe(true);
    }
  });
});
