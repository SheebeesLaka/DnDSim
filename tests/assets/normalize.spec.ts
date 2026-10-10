import { describe, expect, it } from 'vitest';
import {
  enemyDiceFromLegacyDamage,
  normalizeBaseAttributes,
  normalizeCharSheet,
  normalizeEnemy,
  normalizeInventoryItem,
  normalizeItemAbility,
  normalizeSpell,
  normalizeStatus,
  normalizeTerrain,
  normalizeWeapon,
  weaponDiceFromLegacyDamage,
} from '../../src/assets/normalize.ts';
import { enemyStem, javaStem, SAVE_PATHS } from '../../src/assets/filenames.ts';
import { charSheetToJson, orderLike, stringifyLike } from '../../src/assets/write.ts';
import { readSave } from '../helpers/saves.ts';

describe('Gson default semantics', () => {
  it('Status (no no-arg ctor): missing fields are 0 / ""', () => {
    expect(normalizeStatus({ name: 'X' })).toMatchObject({
      name: 'X',
      effectType: 0,
      magnitude: 0,
      duration: 0,
      targetAttribute: 0,
    });
    expect(normalizeStatus({ name: 'X', weird: 1 }).extra).toEqual({ weird: 1 });
  });

  it('ItemAbility (no-arg ctor): missing fields keep constructor defaults, nulls win', () => {
    expect(normalizeItemAbility({})).toMatchObject({
      name: 'Unnamed Ability',
      description: '',
      triggerType: 'ON_TURN_START',
      effectType: 'HEAL',
      magnitude: 0,
      targetAttribute: 0,
      statusName: null,
      abilityType: 'PASSIVE',
    });
    expect(normalizeItemAbility({ abilityType: null }).abilityType).toBe('PASSIVE');
    expect(normalizeItemAbility({ name: null }).name).toBe('');
  });

  it('Spell (no-arg ctor): missing keys keep ctor defaults; normalize() clamps', () => {
    const s = normalizeSpell({ name: 'Blank' });
    expect(s).toMatchObject({
      level: 0,
      range: 6,
      resolution: 'ATTACK',
      targetType: 'ENEMY',
      damageDice: ['d10', null, null],
      area: 'NONE',
      areaSize: 2,
      riderMinTier: 1,
      color: '#7B68EE',
      school: 'Evocation',
    });
    expect(normalizeSpell({ name: null }).name).toBe('Unnamed Spell');
    expect(normalizeSpell({ resolution: 'HEAL', targetType: null }).targetType).toBe('ALLY');
    expect(normalizeSpell({ resolution: 'ATTACK', targetType: null }).targetType).toBe('ENEMY');
    expect(normalizeSpell({ level: 12, range: -3, riderMinTier: 0 })).toMatchObject({
      level: 9,
      range: 0,
      riderMinTier: 1,
    });
    expect(normalizeSpell({ area: 'BURST', areaSize: 0 }).areaSize).toBe(1);
    expect(normalizeSpell({ area: 'NONE', areaSize: 0 }).areaSize).toBe(0);
    expect(normalizeSpell({ damageDice: ['d6'] }).damageDice).toEqual(['d6', null, null]);
    expect(normalizeSpell({ damageDice: null }).damageDice).toEqual([null, null, null]);
    expect(normalizeSpell({ school: null }).school).toBe('');
    expect(normalizeSpell({ onSave: 'half' }).onSave).toBe('NONE');
  });

  it('Weapon: legacy flat damage converts, null dice default, stat default STR, arrays pad to 6', () => {
    expect(
      normalizeWeapon({ name: 'Old', type: 'Weapon', damage: 5, modifiedAttributes: [1, 0, 0, 0] }),
    ).toMatchObject({
      damageDice: ['d6', 'd6', 'd8'],
      statType: 'STRENGTH',
      ammoType: null,
      modifiedAttributes: [1, 0, 0, 0, 0, 0],
      quantity: 0,
      legacyDamage: 5,
    });
    expect(weaponDiceFromLegacyDamage(3)).toEqual(['d4', 'd4', 'd6']);
    expect(weaponDiceFromLegacyDamage(10)).toEqual(['d6', 'd6', 'd10']);
    expect(weaponDiceFromLegacyDamage(11)).toEqual(['d8', 'd8', 'd12']);
    expect(normalizeWeapon({ name: 'N', type: 'Weapon' }).damageDice).toEqual(['d4', 'd4', 'd6']);
    expect(normalizeWeapon({ name: 'N', type: 'Weapon', damageDice: ['d8', 'd8'] }).damageDice).toEqual([
      'd8',
      'd8',
      null,
    ]);
  });

  it('Enemy: legacy attackDamage thresholds differ from Weapon; short attributes fill with dexterity', () => {
    expect(enemyDiceFromLegacyDamage(2)).toEqual(['d4', 'd4', 'd4']);
    expect(enemyDiceFromLegacyDamage(4)).toEqual(['d4', 'd4', 'd6']);
    expect(enemyDiceFromLegacyDamage(6)).toEqual(['d6', 'd6', 'd8']);
    expect(enemyDiceFromLegacyDamage(7)).toEqual(['d6', 'd8', 'd10']);
    const e = normalizeEnemy({ name: 'Old', attackDamage: 7, dexterity: 3, attributes: [5, 9] }, 'Old');
    expect(e.damageDice).toEqual(['d6', 'd8', 'd10']);
    expect(e.attributes).toEqual([5, 9, 3, 3, 3, 3]);
    expect(e.baseName).toBe('Old');
    expect(normalizeEnemy({ name: 'X' }, 'X').attributes).toBeNull();
    expect(normalizeEnemy({ name: 'X' }, 'X').damageDice).toEqual(['d4', 'd4', 'd6']);
  });

  it('CharSheet.load fix-ups: legacy 4-attribute arrays, AC 0 → 10, level ≤ 0 → 1, slot array length', () => {
    expect(normalizeBaseAttributes([3, 5, 5, 4])).toEqual([3, 5, 0, 4, 0, 0]);
    const legacy = normalizeCharSheet(readSave('entities/nonparty/Spider.json'));
    expect(legacy.baseAttributes).toEqual([3, 5, 0, 4, 0, 0]);
    expect(legacy.armorClass).toBe(10);
    expect(legacy.level).toBe(1);
    expect(legacy.color).toBe('#FF0000');
    expect(legacy.spellSlotsUsed).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(legacy.accessories).toEqual([null, null, null]);
    expect(Object.keys(legacy.extra)).toEqual([
      'STRENGTH',
      'DEXTERITY',
      'INITIATIVE',
      'MOBILITY',
      'armor',
      'HEAD',
      'TORSO',
      'LEGS',
    ]);
    expect(normalizeCharSheet({ name: 'A', spellSlotsUsed: [1, 2] }).spellSlotsUsed).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(normalizeCharSheet({ name: 'A', spellcastingStat: '' }).spellcastingStat).toBeNull();
    expect(normalizeCharSheet({ name: 'A', group: 'BOGUS' }).group).toBeNull();
    expect(normalizeCharSheet({ name: 'A', weapons: [null] }).weapons).toEqual([null, null]);
  });

  it('inventory items dispatch on `type` like ItemTypeAdapter (Crafting → plain Item, F-47)', () => {
    expect(normalizeInventoryItem({ name: 'a', type: 'Weapon' }).kind).toBe('weapon');
    expect(normalizeInventoryItem({ name: 'a', type: 'Armor' }).kind).toBe('accessory');
    expect(normalizeInventoryItem({ name: 'a', type: 'Crafting Item' }).kind).toBe('crafting');
    expect(normalizeInventoryItem({ name: 'a', type: 'CraftingItem' }).kind).toBe('crafting');
    expect(normalizeInventoryItem({ name: 'a', type: 'KeyItem' }).kind).toBe('keyitem');
    expect(
      normalizeInventoryItem({ name: 'a', type: 'Crafting', craftingCategory: 'Reagent' }),
    ).toMatchObject({ kind: 'item', extra: { craftingCategory: 'Reagent' } });
    expect(normalizeInventoryItem({ name: 'a' }).kind).toBe('item');
  });

  it('Terrain: port applies the class defaults for missing flags (R15.10)', () => {
    expect(normalizeTerrain({ type: 'Wall', health: 3 })).toMatchObject({
      collision: true,
      entityAboveTerrain: true,
      color: '#008000',
    });
    expect(normalizeTerrain({ health: 3 }).type).toBe('Generic');
    expect(normalizeTerrain(readSave('terrain/Tree.json')).color).toBe('#008000');
  });
});

describe('file names', () => {
  it('javaStem replaces every non-alphanumeric with _', () => {
    expect(javaStem('Henry Keaton')).toBe('Henry_Keaton');
    expect(javaStem("Plasmoid's Fulmen")).toBe('Plasmoid_s_Fulmen');
    expect(javaStem('NMB-15')).toBe('NMB_15');
    expect(SAVE_PATHS.party('Dan Dixon')).toBe('entities/party/Dan_Dixon.json');
  });
  it('enemyStem strips Windows-illegal characters and trailing dots/spaces', () => {
    expect(enemyStem('???')).toBe('___');
    expect(enemyStem('Dr. Petra Ilyas')).toBe('Dr. Petra Ilyas');
    expect(enemyStem('Boss... ')).toBe('Boss');
    expect(enemyStem('a/b:c')).toBe('a_b_c');
    expect(enemyStem('   ')).toBe('Unnamed_Enemy');
  });
});

describe('writers', () => {
  it('writes party sheets compact with PRIMARY/SECONDARY and Java key order', () => {
    const raw = readSave('entities/party/Henry_Keaton.json');
    const text = stringifyLike('party', charSheetToJson(normalizeCharSheet(raw)), raw);
    expect(text.includes('\n')).toBe(false);
    expect(Object.keys(JSON.parse(text) as object)).toEqual(Object.keys(raw as object));
  });
  it('a sheet created in the port has the Java field order without a template', () => {
    const json = charSheetToJson(normalizeCharSheet({ name: 'Fresh', isParty: true }));
    expect(Object.keys(json)).toEqual([
      'name',
      'characterClass',
      'color',
      'isParty',
      'level',
      'totalHP',
      'currentHP',
      'armorClass',
      'status',
      'baseAttributes',
      'tempAttributes',
      'totalAttributes',
      'weapons',
      'PRIMARY',
      'SECONDARY',
      'accessories',
      'inventory',
      'wallet',
      'abilities',
      'knownSpells',
      'spellSlotsUsed',
    ]);
  });
  it('orderLike follows the template recursively and appends new keys', () => {
    expect(
      JSON.stringify(orderLike({ b: 1, a: [{ y: 1, x: 2 }], c: 3 }, { a: [{ x: 0, y: 0 }], b: 0 })),
    ).toBe('{"a":[{"x":2,"y":1}],"b":1,"c":3}');
  });
});
