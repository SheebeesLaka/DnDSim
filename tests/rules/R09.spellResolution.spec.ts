/** R6.16–R6.21, R7.3 slot spending, R7.7 dispatch, riders (R6.23). */
import { describe, expect, it } from 'vitest';
import { saveFailTier, spellDamageBonus, spellDice } from '../../src/engine/rules/combat.ts';
import { combatAssets, enemy, entity, run, started, step } from '../helpers/combat.ts';

const assets = combatAssets();
const spell = (name: string) => assets.spells[name]!;
const used = (s: ReturnType<typeof started>['state'], lvl: number) =>
  entity(s, 'u3').sheet.spellSlotsUsed[lvl - 1];

describe('pure spell math', () => {
  it.each([
    [15, 15, 0],
    [15, 14, 1],
    [15, 10, 1],
    [15, 9, 2],
    [15, 7, 2],
    [15, 6, 3],
    [15, -4, 3],
  ])('DC %i vs total %i → fail tier %i (R6.17)', (dc, total, tier) =>
    expect(saveFailTier(dc, total)).toBe(tier),
  );

  it('spell dice: cumulative tiers, cantrip scaling at 5/11/17, upcast die per level above base (R6.19)', () => {
    expect(spellDice(spell('Fire Bolt'), 1, 1, 0)).toEqual(['d4']);
    expect(spellDice(spell('Fire Bolt'), 3, 1, 0)).toEqual(['d4', 'd6', 'd10']);
    expect(spellDice(spell('Fire Bolt'), 2, 5, 0)).toEqual(['d4', 'd6', 'd4']);
    expect(spellDice(spell('Fire Bolt'), 1, 12, 0)).toEqual(['d4', 'd4', 'd4']);
    expect(spellDice(spell('Fire Bolt'), 1, 17, 0)).toEqual(['d4', 'd4', 'd4', 'd4']);
    expect(spellDice(spell('Fireball'), 3, 12, 5)).toEqual(['d10', 'd10', 'd12', 'd6', 'd6']);
    expect(spellDice(spell('Fireball'), 1, 12, 3)).toEqual(['d10']);
    expect(spellDice(spell('Cure Wounds'), 1, 12, 3)).toEqual(['d8', 'd8', 'd8']);
    expect(spellDice(spell('Hold Person'), 3, 12, 4)).toEqual([]);
    expect(spellDice(spell('Fire Bolt'), 0, 12, 0)).toEqual([]);
    expect(spellDice(spell('Bless'), 1, 12, 1)).toEqual([]);
  });

  it('spell bonus: floorDiv(casting+2, 2) only when addCastingMod, plus flat (R6.20)', () => {
    expect(spellDamageBonus(spell('Cure Wounds'), 11)).toBe(6);
    expect(spellDamageBonus(spell('Cure Wounds'), -3)).toBe(-1);
    expect(spellDamageBonus(spell('Magic Missile'), 11)).toBe(3);
    expect(spellDamageBonus(spell('Fire Bolt'), 11)).toBe(0);
  });
});

describe('single-target flows', () => {
  it('ATTACK: spell attack mod vs AC, crit ×1.5, rider at T3+ (Fire Bolt → Burning), slot free for cantrips', () => {
    const { state, c } = started();
    // GW spell attack +11 vs Spider AC 12: d20 9 → margin 8 → tier 3 (Burning at T3)
    let s = run(state, c, {
      type: 'CAST_SPELL',
      casterId: 'u3',
      spellName: 'Fire Bolt',
      slotLevel: 0,
      targetId: 'u4',
    });
    expect(s.pending).toMatchObject({
      kind: 'd20',
      prompt: 'Enter spell attack d20:',
      flow: { flow: 'spell', attackMod: 11, targetAC: 12, damageBonus: 0 },
    });
    s = run(s, c, { type: 'SUBMIT_ROLL', d20: 9 });
    expect(s.pending).toMatchObject({ kind: 'damage', tier: 3, dice: ['d4', 'd6', 'd10', 'd4', 'd4'] }); // level 12: +2 scaling dice
    const res = step(s, c, { type: 'SUBMIT_ROLL', dice: [1, 1, 1, 1, 1] });
    expect(res.ok && enemy(res.state, 'u4').health).toBe(13);
    expect(res.ok && enemy(res.state, 'u4').statuses).toEqual([
      expect.objectContaining({ name: 'Burning', duration: 2 }),
    ]);
    expect(res.events).toContainEqual(expect.objectContaining({ text: 'Burning', kind: 'STATUS' }));
    expect(res.ok && used(res.state, 1)).toBe(0);
    // tier 1 hit: no rider (riderMinTier 3)
    const t1 = run(
      state,
      c,
      { type: 'CAST_SPELL', casterId: 'u3', spellName: 'Fire Bolt', slotLevel: 0, targetId: 'u4' },
      { type: 'SUBMIT_ROLL', d20: 2 },
      { type: 'SUBMIT_ROLL', dice: [4, 4, 4] },
    );
    expect(enemy(t1, 'u4').statuses).toEqual([]);
    expect(enemy(t1, 'u4').health).toBe(6);
    // crit
    const crit = run(
      state,
      c,
      { type: 'CAST_SPELL', casterId: 'u3', spellName: 'Fire Bolt', slotLevel: 0, targetId: 'u4' },
      { type: 'SUBMIT_ROLL', d20: 20 },
      { type: 'SUBMIT_ROLL', dice: [2, 2, 2, 2, 2] },
    );
    expect(enemy(crit, 'u4').health).toBe(18 - Math.ceil(10 * 1.5));
  });

  it('miss: OK spends the slot (levelled) and floats Miss; Cancel refunds', () => {
    const { state, c } = started();
    const s = run(
      state,
      c,
      { type: 'ADJUST_AC', unitId: 'u4', delta: 5 }, // AC 17: a natural 1 (+11) misses
      { type: 'CAST_SPELL', casterId: 'u3', spellName: 'Guiding Bolt', slotLevel: 2, targetId: 'u4' },
      { type: 'SUBMIT_ROLL', d20: 1 },
    );
    expect(s.pending).toMatchObject({ kind: 'confirm', banner: 'MISS' });
    expect(used(run(s, c, { type: 'CONFIRM_PENDING' }), 2)).toBe(1);
    expect(used(run(s, c, { type: 'CANCEL_PENDING' }), 2)).toBe(0);
  });

  it('SAVE: target d20 + save mod vs DC; fail tier picks dice; HALF halves on success when a T1 die exists; no crit', () => {
    const { state, c } = started();
    // GW DC 21; Snake saves +7 (all 7). Shatter (L2 SAVE CON HALF d8/d8/d8, upcast d8)
    const s = run(state, c, {
      type: 'CAST_SPELL',
      casterId: 'u3',
      spellName: 'Shatter',
      slotLevel: 3,
      targetId: 'u5',
    });
    expect(s.pending).toMatchObject({
      kind: 'd20',
      prompt: "Enter target's d20 save:",
      flow: { saveDC: 21, saveMod: 7 },
    });
    // 20 + 7 = 27 ≥ 21 → saved, half: tier-1 dice + upcast
    const half = run(s, c, { type: 'SUBMIT_ROLL', d20: 20 });
    expect(half.pending).toMatchObject({
      kind: 'damage',
      tier: 1,
      saved: true,
      halve: true,
      dice: ['d8', 'd8'],
    });
    const halfDone = run(half, c, { type: 'SUBMIT_ROLL', dice: [8, 7] });
    expect(enemy(halfDone, 'u5').health).toBe(14 - Math.trunc(15 / 2));
    expect(used(halfDone, 3)).toBe(1);
    // 5 + 7 = 12: fails by 9 → DC - total - 1 = 8 → tier 3; saves never crit even on a 20... use 1 for a sure fail
    const fail = run(s, c, { type: 'SUBMIT_ROLL', d20: 5 });
    expect(fail.pending).toMatchObject({ kind: 'damage', tier: 3, dice: ['d8', 'd8', 'd8', 'd8'] });
    // Hold Person (no dice, onSave NONE): success → SAVED banner; failure → Confirm with no dice, rider applies
    const hold = run(state, c, {
      type: 'CAST_SPELL',
      casterId: 'u3',
      spellName: 'Hold Person',
      slotLevel: 2,
      targetId: 'u5',
    });
    expect(run(hold, c, { type: 'SUBMIT_ROLL', d20: 20 }).pending).toMatchObject({
      kind: 'confirm',
      banner: 'SAVED',
      saved: true,
    });
    const held = run(hold, c, { type: 'SUBMIT_ROLL', d20: 3 }, { type: 'SUBMIT_ROLL', dice: [] });
    expect(enemy(held, 'u5').statuses).toEqual([expect.objectContaining({ name: 'Held', magnitude: -99 })]);
    expect(enemy(held, 'u5').health).toBe(14);
    expect(used(held, 2)).toBe(1);
  });

  it('F-18: HALF needs a tier-1 die under legacy; any tier die when fixed', () => {
    const custom = combatAssets();
    custom.spells['Odd'] = { ...custom.spells['Shatter']!, name: 'Odd', damageDice: [null, 'd8', 'd8'] };
    custom.party['Grand Wizard Man']!.knownSpells.push('Odd');
    for (const legacy of [true, false]) {
      const { state, c } = started(1, [], { halfRequiresTier1Die: legacy }, custom);
      const s = run(
        state,
        c,
        { type: 'CAST_SPELL', casterId: 'u3', spellName: 'Odd', slotLevel: 2, targetId: 'u5' },
        { type: 'SUBMIT_ROLL', d20: 20 },
      );
      expect(s.pending?.kind).toBe(legacy ? 'confirm' : 'damage');
    }
  });

  it('AUTO: straight to tier-3 dice + flat bonus, no crit; HEAL: tier-1 dice capped at max, +casting bonus; BUFF: rider only', () => {
    const { state, c } = started();
    const mm = run(state, c, {
      type: 'CAST_SPELL',
      casterId: 'u3',
      spellName: 'Magic Missile',
      slotLevel: 2,
      targetId: 'u4',
    });
    expect(mm.pending).toMatchObject({
      kind: 'damage',
      tier: 3,
      dice: ['d4', 'd4', 'd4', 'd4'],
      flow: { damageBonus: 3 },
    });
    const mmDone = run(mm, c, { type: 'SUBMIT_ROLL', dice: [4, 4, 4, 4] });
    expect(mmDone.units.some((u) => u.id === 'u4')).toBe(false); // 16 + 3 = 19 ≥ 18 → dead → removed
    const low = run(state, c, { type: 'SET_HP', unitId: 'u2', hp: 5 });
    const cure = run(low, c, {
      type: 'CAST_SPELL',
      casterId: 'u3',
      spellName: 'Cure Wounds',
      slotLevel: 1,
      targetId: 'u2',
    });
    expect(cure.pending).toMatchObject({
      kind: 'damage',
      tier: 1,
      dice: ['d8'],
      prompt: 'Enter heal rolls:',
      flow: { damageBonus: 6 },
    });
    const cured = step(cure, c, { type: 'SUBMIT_ROLL', dice: [8] });
    expect(cured.ok && entity(cured.state, 'u2').sheet.currentHP).toBe(19);
    expect(cured.events).toContainEqual(expect.objectContaining({ text: '+14', kind: 'HEAL' }));
    const blessRes = step(state, c, {
      type: 'CAST_SPELL',
      casterId: 'u3',
      spellName: 'Bless',
      slotLevel: 1,
      targetId: 'u1',
    });
    expect(blessRes.ok && blessRes.state.pending).toBeNull();
    expect(blessRes.ok && entity(blessRes.state, 'u1').sheet.status).toEqual([
      expect.objectContaining({ name: 'Blessed', duration: 10 }),
    ]);
    expect(blessRes.ok && used(blessRes.state, 1)).toBe(1);
    // re-applying refreshes rather than stacks
    const twice = run(blessRes.ok ? blessRes.state : state, c, {
      type: 'CAST_SPELL',
      casterId: 'u3',
      spellName: 'Bless',
      slotLevel: 1,
      targetId: 'u1',
    });
    expect(entity(twice, 'u1').sheet.status).toHaveLength(1);
  });

  it('riders never land on a dead target; healing a removed unit is impossible', () => {
    const { state, c } = started();
    const s = run(
      state,
      c,
      { type: 'SET_HP', unitId: 'u4', hp: 1 },
      { type: 'CAST_SPELL', casterId: 'u3', spellName: 'Fire Bolt', slotLevel: 0, targetId: 'u4' },
      { type: 'SUBMIT_ROLL', d20: 20 },
      { type: 'SUBMIT_ROLL', dice: [4, 6, 10, 4, 4] },
    );
    expect(s.units.some((u) => u.id === 'u4')).toBe(false);
    expect(s.graveyard).toHaveLength(0);
    expect(
      step(s, c, {
        type: 'CAST_SPELL',
        casterId: 'u3',
        spellName: 'Cure Wounds',
        slotLevel: 1,
        targetId: 'u4',
      }),
    ).toMatchObject({ ok: false });
  });
});
