import { describe, expect, it } from 'vitest';
import { StatusEffect, type CharSheetDef } from '../../src/assets/types.ts';
import {
  addItem,
  castingLine,
  equipAccessory,
  equipWeapon,
  forgetSpell,
  learnSpell,
  longRest,
  pointsLabel,
  removeItem,
  removeItemQuantity,
  setBaseAttribute,
  setCastingStat,
  setCurrentHp,
  setLevel,
  setMaxHp,
  setStatusFlag,
  slotPips,
  statPoints,
  statusMenuText,
} from '../../src/editors/sheetOps.ts';
import { bundle } from '../helpers/engine.ts';

const sheet = (name: string): CharSheetDef => {
  const s = bundle().party[name];
  if (!s) throw new Error(`fixture ${name}`);
  return JSON.parse(JSON.stringify(s)) as CharSheetDef;
};
const weapon = (name: string) => {
  const w = bundle().weapons[name];
  if (!w) throw new Error(`fixture ${name}`);
  return w;
};

describe('stat points and level (CharSheet.java:212-230)', () => {
  it('27 points at level 1, two more per level; over-budget is labelled', () => {
    const s = setLevel({ ...sheet('Henry Keaton'), baseAttributes: [5, 5, 5, 5, 4, 3] }, 1);
    expect(statPoints(s)).toEqual({ spent: 27, available: 27, balance: 0 });
    expect(pointsLabel(setBaseAttribute(s, 0, 9))).toBe('Points: 31 / 27 (Over by 4)');
    expect(pointsLabel(setLevel(setBaseAttribute(s, 0, 9), 3))).toBe('Points: 31 / 31');
    expect(setLevel(s, 0).level).toBe(1);
    expect(setLevel(s, 150).level).toBe(99);
  });

  it('base changes re-sync the totals; the input sheet is never mutated', () => {
    const s = sheet('Henry Keaton');
    const before = JSON.stringify(s);
    const t = setBaseAttribute(s, 0, s.baseAttributes[0] + 3);
    expect(t.totalAttributes[0]).toBe(s.totalAttributes[0] + 3);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('hit points and statuses', () => {
  it('lowering max HP lowers current; current is clamped to [0, max]', () => {
    const s = { ...sheet('Henry Keaton'), totalHP: 36, currentHP: 30 };
    expect(setMaxHp(s, 20)).toMatchObject({ totalHP: 20, currentHP: 20 });
    expect(setMaxHp(s, 50)).toMatchObject({ totalHP: 50, currentHP: 30 });
    expect(setCurrentHp(s, 99).currentHP).toBe(36);
    expect(setCurrentHp(s, -4).currentHP).toBe(0);
  });

  it('toggling Unconscious/Dead keeps spell statuses (F-51 fixed) and labels the menu', () => {
    const burning = {
      name: 'Burning',
      effectType: StatusEffect.DAMAGE_OVER_TIME,
      magnitude: 2,
      duration: 2,
      targetAttribute: -1,
      extra: {},
    };
    let s: CharSheetDef = { ...sheet('Henry Keaton'), status: [burning] };
    s = setStatusFlag(s, 'Unconscious', true);
    expect(s.status.map((x) => x.name)).toEqual(['Burning', 'Unconscious']);
    expect(s.status[1]).toMatchObject({ effectType: 0, duration: -1, targetAttribute: -1 });
    expect(statusMenuText(s)).toBe('Unconscious');
    s = setStatusFlag(s, 'Dead', true);
    expect(statusMenuText(s)).toBe('Unconscious, Dead');
    s = setStatusFlag(setStatusFlag(s, 'Unconscious', false), 'Dead', false);
    expect(s.status.map((x) => x.name)).toEqual(['Burning']);
    expect(statusMenuText(s)).toBe('None');
  });
});

describe('inventory and equipment (CharSheet.java:556-870)', () => {
  it('adds stack by name and kind, keep abilities and colour (F-52), and remove by quantity or whole', () => {
    const core = bundle().accessories['Plasmoid Core'];
    if (!core) throw new Error('fixture');
    let s: CharSheetDef = { ...sheet('Henry Keaton'), inventory: [] };
    s = addItem(s, core, 1);
    s = addItem(s, core, 2);
    expect(s.inventory).toHaveLength(1);
    expect(s.inventory[0]).toMatchObject({ name: 'Plasmoid Core', quantity: 3, color: core.color });
    expect((s.inventory[0] as typeof core).abilities.length).toBe(core.abilities.length);
    s = removeItemQuantity(s, core, 2);
    expect(s.inventory[0]?.quantity).toBe(1);
    s = removeItemQuantity(s, core, 5);
    expect(s.inventory).toEqual([]);
    s = removeItem(addItem(s, core, 4), core);
    expect(s.inventory).toEqual([]);
  });

  it('equipping moves the item out of the inventory and the previous one back', () => {
    const sword = weapon('Greatsword');
    const hammer = weapon('Sledgehammer');
    let s: CharSheetDef = { ...sheet('Henry Keaton'), weapons: [null, null], inventory: [] };
    s = addItem(addItem(s, sword, 1), hammer, 2);
    s = equipWeapon(s, 0, sword);
    expect(s.weapons[0]?.name).toBe('Greatsword');
    expect(s.inventory.map((i) => [i.name, i.quantity])).toEqual([['Sledgehammer', 2]]);
    s = equipWeapon(s, 0, hammer);
    expect(s.weapons[0]?.name).toBe('Sledgehammer');
    // one of the two hammers is equipped, the other stays (Java dropped the whole stack)
    expect(s.inventory.map((i) => [i.name, i.quantity]).sort()).toEqual([
      ['Greatsword', 1],
      ['Sledgehammer', 1],
    ]);
    s = equipWeapon(s, 0, null);
    expect(s.weapons[0]).toBeNull();
    expect(s.inventory.find((i) => i.name === 'Sledgehammer')?.quantity).toBe(2);
    // re-selecting the equipped item changes nothing
    const again = equipWeapon(equipWeapon(s, 1, sword), 1, sword);
    expect(again.inventory.some((i) => i.name === 'Greatsword')).toBe(false);
  });

  it('accessories feed the equipment bonus and totals', () => {
    const core = bundle().accessories['Plasmoid Core'];
    if (!core) throw new Error('fixture');
    let s: CharSheetDef = { ...sheet('Henry Keaton'), accessories: [null, null, null], inventory: [] };
    s = equipAccessory(addItem(s, core, 1), 1, core);
    expect(s.accessories[1]?.name).toBe('Plasmoid Core');
    expect(s.tempAttributes).toEqual(core.modifiedAttributes.map((v) => v));
    expect(s.inventory).toEqual([]);
  });
});

describe('spellcasting', () => {
  it('casting stat, DC/attack line, learn/forget and long rest', () => {
    let s = setCastingStat(sheet('Henry Keaton'), 'None');
    expect(s.spellcastingStat).toBeNull();
    expect(castingLine(s)).toBe('Not a caster');
    expect(slotPips(s)).toEqual([]);
    s = setCastingStat(s, 'WISDOM');
    const wis = s.totalAttributes[4] ?? 0;
    expect(castingLine(s)).toBe(`DC ${10 + wis}  |  Atk ${wis >= 0 ? '+' : ''}${wis}`);
    expect(slotPips(setLevel(s, 3))).toEqual([
      { level: 1, remaining: 4, max: 4 },
      { level: 2, remaining: 2, max: 2 },
    ]);
    s = learnSpell(learnSpell(s, 'Fire Bolt'), 'Fire Bolt');
    expect(s.knownSpells.filter((n) => n === 'Fire Bolt')).toHaveLength(1);
    expect(forgetSpell(s, 'Fire Bolt').knownSpells).not.toContain('Fire Bolt');
    const tired = { ...s, spellSlotsUsed: [2, 1, 0, 0, 0, 0, 0, 0, 0] };
    expect(longRest(tired).spellSlotsUsed).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
