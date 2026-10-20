/**
 * New-record factories for the editors: the Java constructors' defaults
 * (AssetEditorView, SpellEditorDialog, CharacterSheetView dialogs), built
 * through the same normalisers the loader uses so a new record and a loaded
 * one have identical shapes.
 */
import {
  normalizeAccessory,
  normalizeAmmunition,
  normalizeCharSheet,
  normalizeConsumable,
  normalizeCraftingItem,
  normalizeEnemy,
  normalizeItemAbility,
  normalizeKeyItem,
  normalizeSpell,
  normalizeTerrain,
  normalizeWeapon,
} from '../assets/normalize.ts';
import { fromLegacyIndex } from '../assets/color.ts';
import { enemyStem } from '../assets/filenames.ts';
import type {
  AccessoryDef,
  AmmunitionDef,
  CharGroup,
  CharSheetDef,
  ConsumableDef,
  CraftingItemDef,
  EnemyDef,
  ItemAbilityDef,
  KeyItemDef,
  SpellDef,
  TerrainDef,
  WeaponDef,
} from '../assets/types.ts';

/** The asset kinds the Asset Editor manages (one saves/items/<folder> each). */
export type AssetItemKind = 'weapon' | 'accessory' | 'consumable' | 'ammunition' | 'crafting' | 'keyitem';
export type AssetItemDef =
  WeaponDef | AccessoryDef | ConsumableDef | AmmunitionDef | CraftingItemDef | KeyItemDef;

/**
 * The `type` string written for each kind. Crafting items are written as
 * "Crafting Item": the Java editor wrote "Crafting", which its own inventory
 * loader does not recognise (FEATURES.md F-47).
 */
export const ITEM_TYPE_STRING: Record<AssetItemKind, string> = {
  weapon: 'Weapon',
  accessory: 'Accessory',
  consumable: 'Consumable',
  ammunition: 'Ammunition',
  crafting: 'Crafting Item',
  keyitem: 'Key Item',
};

export const CRAFTING_CATEGORIES = ['Material', 'Component', 'Reagent', 'Miscellaneous'] as const;
export const DICE_CHOICES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'] as const;
export const STAT_TYPES = [
  'STRENGTH',
  'DEXTERITY',
  'CONSTITUTION',
  'INTELLIGENCE',
  'WISDOM',
  'CHARISMA',
] as const;

export function newItem(kind: AssetItemKind, name = ''): AssetItemDef {
  const type = ITEM_TYPE_STRING[kind];
  switch (kind) {
    case 'weapon':
      return normalizeWeapon({
        name,
        type,
        damageDice: ['d6', 'd6', 'd8'],
        statType: 'STRENGTH',
        modifiedAttributes: [0, 0, 0, 0, 0, 0],
        abilities: [],
        quantity: 1,
      });
    case 'accessory':
      return normalizeAccessory({
        name,
        type,
        defense: 1,
        modifiedAttributes: [0, 0, 0, 0, 0, 0],
        quantity: 1,
      });
    case 'consumable':
      return normalizeConsumable({ name, type, healAmount: 10, quantity: 1 });
    case 'ammunition':
      return normalizeAmmunition({ name, type, ammoType: '12 Gauge', quantity: 1 });
    case 'crafting':
      return normalizeCraftingItem({
        name,
        type,
        craftingCategory: 'Material',
        description: '',
        quantity: 1,
      });
    case 'keyitem':
      return normalizeKeyItem({ name, type, description: '', questRelated: false, quantity: 1 });
  }
}

/** ItemAbility(): what the Add Ability dialogs start from. */
export function newAbility(abilityType = 'PASSIVE'): ItemAbilityDef {
  return normalizeItemAbility({
    name: '',
    description: '',
    triggerType: 'PASSIVE',
    effectType: 'HEAL',
    magnitude: 0,
    targetAttribute: -1,
    statusName: null,
    abilityType,
  });
}

/** `new Spell()` with an empty name (the dialog starts blank). */
export function newSpell(): SpellDef {
  return { ...normalizeSpell({}), name: '' };
}

/** AssetEditorView "+ Add Terrain": HP 10, collision on, entity above. */
export function newTerrain(): TerrainDef {
  return normalizeTerrain({
    type: '',
    health: 10,
    collision: true,
    entityAboveTerrain: true,
    row: 0,
    col: 0,
  });
}

/** CharacterSheetView "+ Enemy" defaults: HP 10, MOB 3, AC 10, DEX 2, every save 2, d4/d4/d6. */
export function newEnemy(): EnemyDef {
  return normalizeEnemy(
    {
      name: 'New Enemy',
      health: 10,
      maxHealth: 10,
      mobility: 3,
      armorClass: 10,
      damageDice: ['d4', 'd4', 'd6'],
      dexterity: 2,
      color: fromLegacyIndex(0),
      tags: [],
      attributes: [2, 2, 2, 2, 2, 2],
      instanceNumber: 0,
    },
    enemyStem('New Enemy'),
  );
}

export interface NewCharacterFields {
  name: string;
  color: string;
  totalHP: number;
  armorClass: number;
  attributes: [number, number, number, number, number, number];
  weapon: WeaponDef | null;
  accessories: [AccessoryDef | null, AccessoryDef | null, AccessoryDef | null];
  group: CharGroup | null;
}

/** "+ Character" dialog defaults (CharacterSheetView.java:927-1118). */
export const NEW_CHARACTER_DEFAULTS: Omit<NewCharacterFields, 'weapon' | 'accessories' | 'group'> = {
  name: 'New Character',
  color: '#000000',
  totalHP: 20,
  armorClass: 10,
  attributes: [5, 5, 5, 5, 4, 3],
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * A new party sheet. Starting gear is equipped once; the Java dialog also put a
 * copy in the inventory (FEATURES.md F-53).
 */
export function newCharacter(f: NewCharacterFields): CharSheetDef {
  const sheet = normalizeCharSheet({
    name: f.name.trim(),
    characterClass: 'None',
    color: f.color,
    isParty: true,
    level: 1,
    totalHP: f.totalHP,
    currentHP: f.totalHP,
    armorClass: f.armorClass,
    status: [],
    baseAttributes: [...f.attributes],
    tempAttributes: [0, 0, 0, 0, 0, 0],
    totalAttributes: [...f.attributes],
    weapons: [null, null],
    accessories: [null, null, null],
    inventory: [],
    wallet: 0,
    abilities: [],
    knownSpells: [],
    spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  });
  sheet.group = f.group;
  sheet.weapons = [f.weapon ? { ...clone(f.weapon), quantity: 1 } : null, null];
  sheet.accessories = f.accessories.map((a) =>
    a ? { ...clone(a), quantity: 1 } : null,
  ) as CharSheetDef['accessories'];
  return sheet;
}
