/** R7.8–R7.10 area geometry and targets, R6.22 shared area rolls. */
import { describe, expect, it } from 'vitest';
import { sumRolledForTier } from '../../src/engine/rules/combat.ts';
import { areaCells, areaTargets, isAimValid } from '../../src/engine/rules/targeting.ts';
import type { Command } from '../../src/engine/types.ts';
import { combatAssets, enemy, entity, run, started, step } from '../helpers/combat.ts';

const assets = combatAssets();
const spell = (name: string) => assets.spells[name]!;
const keys = (cells: { r: number; c: number }[]) => cells.map((x) => `${x.r},${x.c}`).sort();

describe('R7.9 area cells', () => {
  it('BURST: Manhattan diamond; self-centred bursts exclude the caster; aim must be within max(1, range) and enabled', () => {
    const { state } = started();
    const gw = entity(state, 'u3'); // (0,2)
    expect(isAimValid(state, spell('Fireball'), gw, { r: 3, c: 3 })).toBe(true);
    expect(isAimValid(state, spell('Fireball'), gw, { r: 7, c: 7 })).toBe(false); // distance 12 > 8
    expect(isAimValid(state, spell('Fireball'), gw, { r: 9, c: 9 })).toBe(false); // out of bounds
    expect(keys(areaCells(state, { ...spell('Fireball'), areaSize: 1 }, gw, { r: 3, c: 3 }))).toEqual(
      keys([
        { r: 2, c: 3 },
        { r: 3, c: 2 },
        { r: 3, c: 3 },
        { r: 3, c: 4 },
        { r: 4, c: 3 },
      ]),
    );
    expect(areaCells(state, spell('Fireball'), gw, { r: 3, c: 3 })).toHaveLength(13);
    const tc = areaCells(state, spell('Thunderclap'), gw, { r: 0, c: 2 }); // burst 1 around the caster at the top edge
    expect(keys(tc)).toEqual(
      keys([
        { r: 0, c: 1 },
        { r: 0, c: 3 },
        { r: 1, c: 2 },
      ]),
    );
    expect(isAimValid(state, spell('Thunderclap'), gw, { r: 5, c: 5 })).toBe(true); // self-centred: any in-bounds aim
  });

  it('CONE: dominant axis facing (ties → vertical), widths 1,3,3,5,5…; range ignored', () => {
    const { state } = started();
    const caster = { ...entity(state, 'u3'), r: 4, c: 4 };
    const south = areaCells(state, spell('Burning Hands'), caster, { r: 6, c: 4 }); // size 3
    expect(keys(south)).toEqual(
      keys([
        { r: 5, c: 4 },
        { r: 6, c: 3 },
        { r: 6, c: 4 },
        { r: 6, c: 5 },
        { r: 7, c: 3 },
        { r: 7, c: 4 },
        { r: 7, c: 5 },
      ]),
    );
    const east = areaCells(state, spell('Burning Hands'), caster, { r: 4, c: 7 });
    expect(keys(east)).toEqual(
      keys([
        { r: 4, c: 5 },
        { r: 3, c: 6 },
        { r: 4, c: 6 },
        { r: 5, c: 6 },
        { r: 3, c: 7 },
        { r: 4, c: 7 },
        { r: 5, c: 7 },
      ]),
    );
    const diagonal = areaCells(state, spell('Burning Hands'), caster, { r: 6, c: 6 }); // tie → vertical (south)
    expect(keys(diagonal)).toEqual(keys(south));
    const north = areaCells(state, { ...spell('Burning Hands'), areaSize: 5 }, caster, { r: 0, c: 4 });
    expect(north).toHaveLength(1 + 3 + 3 + 5); // f=4 clipped by the top edge? r = 4-4 = 0 ok; f=5 → r=-1 clipped
    expect(isAimValid(state, spell('Burning Hands'), caster, { r: 4, c: 4 })).toBe(false);
  });

  it('LINE: any angle, Java rounding, de-duplicated, continues past the aim for its full length', () => {
    const { state } = started();
    const caster = { ...entity(state, 'u3'), r: 0, c: 0 };
    const diag = areaCells(state, { ...spell('Lightning Bolt'), areaSize: 4 }, caster, { r: 1, c: 1 });
    expect(keys(diag)).toEqual(
      keys([
        { r: 1, c: 1 },
        { r: 2, c: 2 },
        { r: 3, c: 3 },
        { r: 4, c: 4 },
      ]),
    );
    const shallow = areaCells(state, { ...spell('Lightning Bolt'), areaSize: 6 }, caster, { r: 1, c: 3 });
    // steps 3: sr=1/3, sc=1 → (round(1/3),1)=(0,1),(1,2),(1,3),(1,4),(2,5),(2,6)
    expect(shallow.map((x) => `${x.r},${x.c}`)).toEqual(['0,1', '1,2', '1,3', '1,4', '2,5', '2,6']);
    const half = areaCells(state, { ...spell('Lightning Bolt'), areaSize: 3 }, caster, { r: 1, c: 2 });
    // sr=0.5: Math.round half-up → r = 1 at i=1 (0.5→1), 1 at i=2, 2 at i=3 (1.5→2)
    expect(half.map((x) => `${x.r},${x.c}`)).toEqual(['1,1', '1,2', '2,3']);
  });

  it('R7.10 targets: living combatants on covered cells; friendly → same side only; harmful → other side + own side with friendlyFire', () => {
    const { state } = started();
    const gw = entity(state, 'u3');
    const cells = [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
      { r: 0, c: 2 },
      { r: 3, c: 3 },
      { r: 6, c: 6 },
    ];
    expect(areaTargets(state, spell('Mass Healing Word'), gw, cells).map((u) => u.id)).toEqual([
      'u1',
      'u2',
      'u3',
    ]);
    expect(areaTargets(state, spell('Fireball'), gw, cells).map((u) => u.id)).toEqual([
      'u1',
      'u2',
      'u3',
      'u4',
    ]); // friendlyFire
    expect(areaTargets(state, spell('Thunderclap'), gw, cells).map((u) => u.id)).toEqual(['u4']); // no friendly fire
    const dead = {
      ...state,
      units: state.units.map((u) => (u.id === 'u4' && u.kind === 'enemy' ? { ...u, health: 0 } : u)),
    };
    expect(areaTargets(dead, spell('Fireball'), gw, cells).map((u) => u.id)).toEqual(['u1', 'u2', 'u3']);
  });
});

describe('R6.22 area resolution', () => {
  it('sumRolledForTier: own tier dice + shared extras rolled at the max tier', () => {
    const fb = spell('Fireball'); // d10/d10/d12 + upcast d6
    const rolled = [10, 9, 12, 6, 5]; // tier 3 at slot 5: 3 tier dice + 2 upcast
    expect(sumRolledForTier(fb, rolled, 3, 3)).toBe(42);
    expect(sumRolledForTier(fb, rolled, 3, 2)).toBe(10 + 9 + 6 + 5);
    expect(sumRolledForTier(fb, rolled, 3, 1)).toBe(10 + 6 + 5);
    expect(sumRolledForTier(fb, rolled, 3, 0)).toBe(0);
    expect(sumRolledForTier(spell('Hold Person'), rolled, 3, 3)).toBe(0);
  });

  it('SAVE area: one d20 per target, shared dice at the highest tier, per-target halving and riders, slot spent once', () => {
    // Spider (3,3) and Snake (4,4) both inside a Fireball at (3,4) (radius 2); GW DC 21, Spider saves +4, Snake +7
    const { state, c } = started();
    let s = run(state, c, {
      type: 'CAST_SPELL',
      casterId: 'u3',
      spellName: 'Fireball',
      slotLevel: 4,
      aim: { r: 3, c: 4 },
    });
    expect(s.pending).toMatchObject({ kind: 'areaD20s', flow: { targetIds: ['u4', 'u5'], saveDC: 21 } });
    expect(step(s, c, { type: 'SUBMIT_ROLL', areaD20s: [20] })).toMatchObject({
      ok: false,
      error: { code: 'invalidRoll' },
    });
    // Spider: 20+4=24 saves (half, tier 1). Snake: 2+7=9 → fails by 12 → tier 3 → Burning (riderMinTier 3)
    s = run(s, c, { type: 'SUBMIT_ROLL', areaD20s: [20, 2] });
    expect(s.pending).toMatchObject({
      kind: 'damage',
      dice: ['d10', 'd10', 'd12', 'd6'],
      area: { tiers: [1, 3], saved: [true, false], half: [true, false], maxTier: 3 },
    });
    const res = step(s, c, { type: 'SUBMIT_ROLL', dice: [10, 10, 12, 6] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(enemy(res.state, 'u4').health).toBe(18 - Math.trunc((10 + 6) / 2)); // own T1 die + shared upcast, halved
    expect(res.state.units.some((u) => u.id === 'u5')).toBe(false); // 38 damage kills the Snake
    expect(res.state.turn.enemiesDefeated).toBe(1);
    expect(enemy(res.state, 'u4').statuses).toEqual([]); // saved → no rider
    expect(entity(res.state, 'u3').sheet.spellSlotsUsed[3]).toBe(1);
  });

  it('ATTACK area with crits; ALL MISSED → confirm spends the slot; AUTO_FILL fills blanks randomly', () => {
    const custom = combatAssets();
    custom.spells['Scorch'] = {
      ...custom.spells['Fire Bolt']!,
      name: 'Scorch',
      level: 1,
      area: 'BURST',
      areaSize: 2,
      range: 8,
      riderMinTier: 1,
    };
    custom.party['Grand Wizard Man']!.knownSpells.push('Scorch');
    const { state, c } = started(
      1,
      [
        { type: 'ADJUST_AC', unitId: 'u4', delta: 5 },
        { type: 'ADJUST_AC', unitId: 'u5', delta: 5 },
      ],
      {},
      custom,
    ); // both AC 17
    const cast: Command = {
      type: 'CAST_SPELL',
      casterId: 'u3',
      spellName: 'Scorch',
      slotLevel: 1,
      aim: { r: 3, c: 4 },
    };
    let s = run(state, c, cast, { type: 'SUBMIT_ROLL', areaD20s: [20, 1] }); // Spider crit T3 (20+11-12=19), Snake miss
    expect(s.pending).toMatchObject({
      kind: 'damage',
      area: { tiers: [3, 0], crit: [true, false], maxTier: 3 },
    });
    s = run(s, c, { type: 'SUBMIT_ROLL', dice: [4, 6, 10] });
    expect(s.units.some((u) => u.id === 'u4')).toBe(false); // ceil(20 × 1.5) = 30 ≥ 18 → removed
    const missAll = run(state, c, cast, { type: 'SUBMIT_ROLL', areaD20s: [1, 1] });
    expect(missAll.pending).toMatchObject({ kind: 'confirm', banner: 'ALL MISSED' });
    const confirmed = step(missAll, c, { type: 'CONFIRM_PENDING' });
    expect(confirmed.ok && entity(confirmed.state, 'u3').sheet.spellSlotsUsed[0]).toBe(1);
    expect(confirmed.events.filter((e) => e.type === 'floatText' && e.text === 'Miss')).toHaveLength(2);
    const auto = run(state, c, cast, { type: 'AUTO_FILL_AREA_ROLLS', d20s: [20] });
    expect(['damage', 'confirm']).toContain(auto.pending?.kind);
  });

  it('AUTO/HEAL areas go straight to a shared roll; BUFF areas resolve instantly; no targets keeps the slot', () => {
    const custom = combatAssets();
    custom.spells['Mass Bless'] = {
      ...custom.spells['Bless']!,
      name: 'Mass Bless',
      area: 'BURST',
      areaSize: 3,
      range: 4,
    };
    custom.party['Grand Wizard Man']!.knownSpells.push('Mass Bless');
    const { state, c } = started(1, [], {}, custom);
    const heal = run(
      state,
      c,
      { type: 'SET_HP', unitId: 'u1', hp: 1 },
      {
        type: 'CAST_SPELL',
        casterId: 'u3',
        spellName: 'Mass Healing Word',
        slotLevel: 3,
        aim: { r: 0, c: 1 },
      },
    );
    expect(heal.pending).toMatchObject({
      kind: 'damage',
      dice: ['d4'],
      prompt: 'Enter heal rolls (shared):',
      area: { tiers: [1, 1, 1] },
    });
    const healed = run(heal, c, { type: 'SUBMIT_ROLL', dice: [4] });
    expect(entity(healed, 'u1').sheet.currentHP).toBe(1 + 4 + 6);
    expect(entity(healed, 'u3').sheet.currentHP).toBe(20);
    const bless = step(state, c, {
      type: 'CAST_SPELL',
      casterId: 'u3',
      spellName: 'Mass Bless',
      slotLevel: 1,
      aim: { r: 0, c: 1 },
    });
    expect(bless.ok && bless.state.pending).toBeNull();
    expect(bless.ok && entity(bless.state, 'u1').sheet.status.map((x) => x.name)).toEqual(['Blessed']);
    const empty = step(state, c, {
      type: 'CAST_SPELL',
      casterId: 'u3',
      spellName: 'Fireball',
      slotLevel: 3,
      aim: { r: 6, c: 2 },
    });
    expect(empty).toMatchObject({ ok: false, error: { code: 'noTargets' } });
    expect(empty.events).toContainEqual(expect.objectContaining({ text: 'No targets' }));
    const far = step(state, c, {
      type: 'CAST_SPELL',
      casterId: 'u3',
      spellName: 'Fireball',
      slotLevel: 3,
      aim: { r: 7, c: 7 },
    });
    expect(far).toMatchObject({ ok: false, error: { code: 'badAim' } });
    expect(far.events).toContainEqual(expect.objectContaining({ text: 'Out of range' }));
  });
});
