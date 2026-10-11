/** Character Sheets edits reaching a running battle (Java shares the CharSheet object). */
import { describe, expect, it } from 'vitest';
import type { CharSheetDef } from '../../src/assets/types.ts';
import { partySheetsToPersist } from '../../src/engine/selectors/persistence.ts';
import { entity, run, started, step } from '../helpers/combat.ts';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('REPLACE_SHEET', () => {
  it('replaces the sheet of the combatant drawn from it and keeps battle-only adjustments', () => {
    const { state, c } = started();
    let s = run(state, c, { type: 'ADJUST_AC', unitId: 'u1', delta: 2 });
    const edited: CharSheetDef = clone(entity(s, 'u1').sheet);
    edited.totalHP = 50;
    edited.currentHP = 44;
    edited.baseAttributes[0] = 9;
    s = run(s, c, { type: 'REPLACE_SHEET', sourceName: 'Henry Keaton', sheet: edited });
    const u = entity(s, 'u1');
    expect(u.sheet.currentHP).toBe(44);
    expect(u.sheet.totalHP).toBe(50);
    expect(u.sheet.totalAttributes[0]).toBe(9 + (u.sheet.tempAttributes[0] ?? 0));
    expect(u.acAdjustment).toBe(2);
    expect(u.r).toBe(0);
  });

  it('follows a rename through to the source name, the saved sheets and the placement queue', () => {
    const { state, c } = started();
    const edited = clone(entity(state, 'u2').sheet);
    edited.name = 'Daniel Dixon';
    const res = step(state, c, { type: 'REPLACE_SHEET', sourceName: 'Dan Dixon', sheet: edited });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(entity(res.state, 'u2').sourceName).toBe('Daniel Dixon');
    expect(Object.keys(partySheetsToPersist(res.state))).toContain('Daniel Dixon');
    expect(Object.keys(partySheetsToPersist(res.state))).not.toContain('Dan Dixon');
    expect(res.events).toContainEqual({ type: 'sheetChanged', sourceName: 'Daniel Dixon' });
  });

  it('is accepted while a roll is pending (Java applies sheet edits whenever they happen)', () => {
    const { state, c } = started();
    const s = run(state, c, { type: 'ATTACK', attackerId: 'u1', targetId: 'u4' });
    expect(s.pending).not.toBeNull();
    const edited = clone(entity(s, 'u1').sheet);
    edited.characterClass = 'Brawler';
    const res = step(s, c, { type: 'REPLACE_SHEET', sourceName: 'Henry Keaton', sheet: edited });
    expect(res.ok && entity(res.state, 'u1').sheet.characterClass).toBe('Brawler');
  });

  it('refuses a sheet that is not in the battle, or one without a name', () => {
    const { state, c } = started();
    const stranger = clone(entity(state, 'u1').sheet);
    stranger.name = 'Nobody';
    expect(step(state, c, { type: 'REPLACE_SHEET', sourceName: 'Nobody', sheet: stranger })).toMatchObject({
      ok: false,
      error: { code: 'unknownSheet' },
    });
    const nameless = clone(entity(state, 'u1').sheet);
    nameless.name = '';
    expect(
      step(state, c, { type: 'REPLACE_SHEET', sourceName: 'Henry Keaton', sheet: nameless }),
    ).toMatchObject({
      ok: false,
      error: { code: 'badSheet' },
    });
  });
});
