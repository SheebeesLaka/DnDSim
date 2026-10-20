/**
 * Normalised asset types: what the engine and UI consume after a legacy JSON
 * file has been validated and defaulted. Every record keeps `extra`, the keys
 * the Java app wrote that the port does not model (e.g. `PRIMARY`, stale
 * enemy `initiative`), so a round-trip write preserves them.
 */

export type Extra = Record<string, unknown>;

/** Attribute indices, CharSheet.STRENGTH..CHARISMA. */
export const STR = 0;
export const DEX = 1;
export const CON = 2;
export const INT = 3;
export const WIS = 4;
export const CHA = 5;
export const ATTRIBUTE_COUNT = 6;
export const ATTRIBUTE_NAMES = [
  'STRENGTH',
  'DEXTERITY',
  'CONSTITUTION',
  'INTELLIGENCE',
  'WISDOM',
  'CHARISMA',
] as const;
export const ATTRIBUTE_SHORT = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
export type Attributes6 = [number, number, number, number, number, number];

/** A single-die string such as "d6"; null = no die in that tier. */
export type Die = string | null;
export type DiceTiers = [Die, Die, Die];

// ---- Status (EntityRes/Status.java) ----
export const StatusEffect = {
  NONE: 0,
  DAMAGE_OVER_TIME: 1,
  HEAL_OVER_TIME: 2,
  STAT_MODIFIER: 3,
  MOVEMENT_MODIFIER: 4,
  AC_MODIFIER: 5,
  ATTACK_MODIFIER: 6,
} as const;
export const STATUS_EFFECT_NAMES = [
  'None',
  'Damage over time',
  'Heal over time',
  'Stat modifier',
  'Movement modifier',
  'AC modifier',
  'Attack modifier',
] as const;

export interface StatusDef {
  name: string;
  effectType: number;
  magnitude: number;
  /** turns remaining; -1 = permanent (0 never expires either, see F-8) */
  duration: number;
  /** attribute index for STAT_MODIFIER / MOVEMENT_MODIFIER; -1 = none */
  targetAttribute: number;
  extra: Extra;
}

// ---- ItemAbility (EntityRes/ItemAbility.java) ----
export const AbilityTrigger = {
  PASSIVE: 'PASSIVE',
  ON_TURN_START: 'ON_TURN_START',
  ON_HIT: 'ON_HIT',
  ON_EQUIP: 'ON_EQUIP',
  ON_DAMAGED: 'ON_DAMAGED',
} as const;
export const AbilityEffect = {
  HEAL: 'HEAL',
  DAMAGE: 'DAMAGE',
  STAT_BOOST: 'STAT_BOOST',
  STATUS: 'STATUS',
} as const;
export const AbilityType = { PASSIVE: 'PASSIVE', ACTIVE: 'ACTIVE', SPECIAL: 'SPECIAL' } as const;

export interface ItemAbilityDef {
  name: string;
  description: string;
  triggerType: string;
  effectType: string;
  magnitude: number;
  targetAttribute: number;
  statusName: string | null;
  abilityType: string;
  extra: Extra;
}

// ---- Items (EntityRes/Item.java and subclasses) ----
export type ItemKind = 'weapon' | 'accessory' | 'consumable' | 'ammunition' | 'crafting' | 'keyitem' | 'item';

interface ItemBase {
  kind: ItemKind;
  name: string;
  /** The raw `type` string Java wrote ("Weapon", "Key Item", "Crafting" …). */
  type: string;
  color: string;
  quantity: number;
  extra: Extra;
}
export interface WeaponDef extends ItemBase {
  kind: 'weapon';
  damageDice: DiceTiers;
  statType: string;
  /** null/empty = melee (Weapon.isRanged is `ammoType != null && !isEmpty`) */
  ammoType: string | null;
  modifiedAttributes: Attributes6;
  abilities: ItemAbilityDef[];
  /** legacy flat damage; kept so a rewrite preserves it */
  legacyDamage: number;
}
export interface AccessoryDef extends ItemBase {
  kind: 'accessory';
  defense: number;
  modifiedAttributes: Attributes6;
  abilities: ItemAbilityDef[];
  legacyArmorType: number;
}
export interface ConsumableDef extends ItemBase {
  kind: 'consumable';
  healAmount: number;
  effect: StatusDef | null;
}
export interface AmmunitionDef extends ItemBase {
  kind: 'ammunition';
  /** raw `ammoType` field (may be null on legacy files, see F-16) */
  ammoType: string | null;
  legacyCompatibleWeaponType: string | null;
  legacyDamageBonus: number;
}
export interface CraftingItemDef extends ItemBase {
  kind: 'crafting';
  craftingCategory: string | null;
  description: string | null;
}
export interface KeyItemDef extends ItemBase {
  kind: 'keyitem';
  description: string | null;
  questRelated: boolean;
}
export interface PlainItemDef extends ItemBase {
  kind: 'item';
}
export type ItemDef =
  WeaponDef | AccessoryDef | ConsumableDef | AmmunitionDef | CraftingItemDef | KeyItemDef | PlainItemDef;

// ---- CharSheet (EntityRes/CharSheet.java) ----
export const CHAR_GROUPS = ['OMEGA', 'ALPHA', 'NPC'] as const;
export type CharGroup = (typeof CHAR_GROUPS)[number];

export interface CharSheetDef {
  name: string;
  characterClass: string;
  color: string;
  isParty: boolean;
  spritePath: string | null;
  level: number;
  group: CharGroup | null;
  totalHP: number;
  currentHP: number;
  armorClass: number;
  status: StatusDef[];
  baseAttributes: Attributes6;
  /** Equipment-only modifiers as last written by Java; recomputed by the engine. */
  tempAttributes: Attributes6;
  totalAttributes: Attributes6;
  weapons: [WeaponDef | null, WeaponDef | null];
  accessories: [AccessoryDef | null, AccessoryDef | null, AccessoryDef | null];
  inventory: ItemDef[];
  wallet: number;
  abilities: ItemAbilityDef[];
  /** null = not a caster */
  spellcastingStat: string | null;
  knownSpells: string[];
  spellSlotsUsed: number[]; // length 9
  /** perished in battle (marked by the "perish" choice for a dying hero); written only when true */
  dead?: boolean;
  extra: Extra;
}

// ---- Enemy template (Objects/Enemy.java) ----
export interface EnemyDef {
  /** File stem: the key Enemy.load() uses (differs from name for "???" → "___"). */
  fileStem: string;
  name: string;
  baseName: string;
  health: number;
  maxHealth: number;
  mobility: number;
  armorClass: number;
  damageDice: DiceTiers;
  dexterity: number;
  color: string;
  spritePath: string | null;
  tags: string[];
  /** Saving-throw stats; null = legacy file (every save defaults to dexterity). */
  attributes: Attributes6 | null;
  instanceNumber: number;
  legacyAttackDamage: number;
  row: number;
  col: number;
  extra: Extra;
}

// ---- Spell (EntityRes/Spell.java) ----
export const SpellResolution = {
  ATTACK: 'ATTACK',
  SAVE: 'SAVE',
  HEAL: 'HEAL',
  BUFF: 'BUFF',
  AUTO: 'AUTO',
} as const;
export type SpellResolutionType = (typeof SpellResolution)[keyof typeof SpellResolution];
export const SpellTarget = { ENEMY: 'ENEMY', ALLY: 'ALLY', SELF: 'SELF', ANY: 'ANY' } as const;
export type SpellTargetType = (typeof SpellTarget)[keyof typeof SpellTarget];
export const SpellArea = { NONE: 'NONE', BURST: 'BURST', CONE: 'CONE', LINE: 'LINE' } as const;
export type SpellAreaType = (typeof SpellArea)[keyof typeof SpellArea];
export const CANTRIP_SCALING_LEVELS = [5, 11, 17] as const;

export interface SpellDef {
  name: string;
  description: string;
  color: string;
  level: number;
  school: string;
  resolution: SpellResolutionType;
  range: number;
  targetType: SpellTargetType;
  damageDice: DiceTiers;
  saveStat: string;
  onSave: 'NONE' | 'HALF';
  upcastDie: string | null;
  riderStatus: StatusDef | null;
  riderMinTier: number;
  addCastingMod: boolean;
  flatDamage: number;
  area: SpellAreaType;
  areaSize: number;
  friendlyFire: boolean;
  extra: Extra;
}

// ---- Terrain (Objects/TerrainObject.java) ----
export interface TerrainDef {
  type: string;
  health: number;
  color: string;
  collision: boolean;
  entityAboveTerrain: boolean;
  spritePath: string | null;
  row: number;
  col: number;
  extra: Extra;
}

// ---- Grid shape preset (UI/GridShapePreset.java) ----
export interface GridShapePresetDef {
  name: string;
  rows: number;
  cols: number;
  mask: boolean[][];
  extra: Extra;
}

/** Everything the app loads at startup, normalised. */
export interface AssetBundle {
  /** party sheets keyed by display name (Java keys sheets by name) */
  party: Record<string, CharSheetDef>;
  /** file stem → sheet, for writing back to the same file */
  partyStems: Record<string, string>;
  /** enemy templates keyed by file stem (Enemy.load key) */
  enemies: Record<string, EnemyDef>;
  weapons: Record<string, WeaponDef>;
  accessories: Record<string, AccessoryDef>;
  consumables: Record<string, ConsumableDef>;
  ammunition: Record<string, AmmunitionDef>;
  crafting: Record<string, CraftingItemDef>;
  keyitems: Record<string, KeyItemDef>;
  spells: Record<string, SpellDef>;
  terrain: TerrainDef[];
  gridshapes: GridShapePresetDef[];
  partyList: string[];
  uiPrefs: Record<string, string>;
  enemyTags: string[];
  /** per-file load problems, never fatal */
  problems: { path: string; message: string }[];
}
