/**
 * Zod schemas for the raw on-disk JSON formats written by the Java app.
 * They are deliberately loose: unknown keys pass through (Gson ignores them on
 * load, and the port preserves them on write), every field is optional, and
 * `null` is distinguished from "missing" because Gson treats them differently
 * for classes with a no-arg constructor (missing keeps the constructor default,
 * null overwrites it).
 */
import { z } from 'zod';

const num = z.number();
const str = z.string();
const bool = z.boolean();
const colorLike = z.union([z.string(), z.number()]);
const dieArray = z.array(z.string().nullable());
const numArray = z.array(z.number());

export const rawStatusSchema = z.looseObject({
  name: str.nullish(),
  effectType: num.nullish(),
  magnitude: num.nullish(),
  duration: num.nullish(),
  targetAttribute: num.nullish(),
});
export type RawStatus = z.infer<typeof rawStatusSchema>;

export const rawItemAbilitySchema = z.looseObject({
  name: str.nullish(),
  description: str.nullish(),
  triggerType: str.nullish(),
  effectType: str.nullish(),
  magnitude: num.nullish(),
  targetAttribute: num.nullish(),
  statusName: str.nullish(),
  abilityType: str.nullish(),
});
export type RawItemAbility = z.infer<typeof rawItemAbilitySchema>;

const rawItemBase = {
  name: str.nullish(),
  type: str.nullish(),
  color: colorLike.nullish(),
  quantity: num.nullish(),
};

export const rawWeaponSchema = z.looseObject({
  ...rawItemBase,
  damageDice: dieArray.nullish(),
  statType: str.nullish(),
  ammoType: str.nullish(),
  modifiedAttributes: numArray.nullish(),
  abilities: z.array(rawItemAbilitySchema).nullish(),
  damage: num.nullish(),
});
export const rawAccessorySchema = z.looseObject({
  ...rawItemBase,
  defense: num.nullish(),
  modifiedAttributes: numArray.nullish(),
  abilities: z.array(rawItemAbilitySchema).nullish(),
  armorType: num.nullish(),
});
export const rawConsumableSchema = z.looseObject({
  ...rawItemBase,
  healAmount: num.nullish(),
  effect: rawStatusSchema.nullish(),
});
export const rawAmmunitionSchema = z.looseObject({
  ...rawItemBase,
  ammoType: str.nullish(),
  damageBonus: num.nullish(),
  compatibleWeaponType: str.nullish(),
});
export const rawCraftingItemSchema = z.looseObject({
  ...rawItemBase,
  craftingCategory: str.nullish(),
  description: str.nullish(),
});
export const rawKeyItemSchema = z.looseObject({
  ...rawItemBase,
  description: str.nullish(),
  questRelated: bool.nullish(),
});
export const rawPlainItemSchema = z.looseObject(rawItemBase);
/** Inventory entries are dispatched on `type` by the normaliser (ItemTypeAdapter). */
export const rawAnyItemSchema = z.looseObject(rawItemBase);

export const rawCharSheetSchema = z.looseObject({
  name: str.nullish(),
  characterClass: str.nullish(),
  color: colorLike.nullish(),
  isParty: bool.nullish(),
  spritePath: str.nullish(),
  level: num.nullish(),
  group: str.nullish(),
  totalHP: num.nullish(),
  currentHP: num.nullish(),
  armorClass: num.nullish(),
  status: z.array(rawStatusSchema).nullish(),
  baseAttributes: numArray.nullish(),
  tempAttributes: numArray.nullish(),
  totalAttributes: numArray.nullish(),
  weapons: z.array(rawWeaponSchema.nullable()).nullish(),
  accessories: z.array(rawAccessorySchema.nullable()).nullish(),
  inventory: z.array(rawAnyItemSchema).nullish(),
  wallet: num.nullish(),
  abilities: z.array(rawItemAbilitySchema).nullish(),
  spellcastingStat: str.nullish(),
  knownSpells: z.array(str).nullish(),
  spellSlotsUsed: numArray.nullish(),
});
export type RawCharSheet = z.infer<typeof rawCharSheetSchema>;

export const rawEnemySchema = z.looseObject({
  name: str.nullish(),
  health: num.nullish(),
  maxHealth: num.nullish(),
  mobility: num.nullish(),
  armorClass: num.nullish(),
  damageDice: dieArray.nullish(),
  dexterity: num.nullish(),
  color: colorLike.nullish(),
  instanceNumber: num.nullish(),
  baseName: str.nullish(),
  spritePath: str.nullish(),
  tags: z.array(str).nullish(),
  attributes: numArray.nullish(),
  attackDamage: num.nullish(),
  row: num.nullish(),
  col: num.nullish(),
});
export type RawEnemy = z.infer<typeof rawEnemySchema>;

export const rawSpellSchema = z.looseObject({
  name: str.nullish(),
  description: str.nullish(),
  color: colorLike.nullish(),
  level: num.nullish(),
  school: str.nullish(),
  resolution: str.nullish(),
  range: num.nullish(),
  targetType: str.nullish(),
  damageDice: dieArray.nullish(),
  saveStat: str.nullish(),
  onSave: str.nullish(),
  upcastDie: str.nullish(),
  riderStatus: rawStatusSchema.nullish(),
  riderMinTier: num.nullish(),
  addCastingMod: bool.nullish(),
  flatDamage: num.nullish(),
  area: str.nullish(),
  areaSize: num.nullish(),
  friendlyFire: bool.nullish(),
});
export type RawSpell = z.infer<typeof rawSpellSchema>;

export const rawTerrainSchema = z.looseObject({
  type: str.nullish(),
  health: num.nullish(),
  color: colorLike.nullish(),
  collision: bool.nullish(),
  entityAboveTerrain: bool.nullish(),
  spritePath: str.nullish(),
  row: num.nullish(),
  col: num.nullish(),
});
export type RawTerrain = z.infer<typeof rawTerrainSchema>;

export const rawGridShapePresetSchema = z.looseObject({
  name: str.nullish(),
  rows: num.nullish(),
  cols: num.nullish(),
  mask: z.array(z.array(bool)).nullish(),
});
export type RawGridShapePreset = z.infer<typeof rawGridShapePresetSchema>;

export const rawPartyListSchema = z.array(str);
export const rawUiPrefsSchema = z.record(str, z.union([str, num, bool]).nullable());
export const rawEnemyTagsSchema = z.array(str);

/** Shape of GET /api/assets. */
export const rawAssetBundleSchema = z.object({
  party: z.record(str, z.unknown()),
  nonparty: z.record(str, z.unknown()).default({}),
  enemies: z.record(str, z.unknown()),
  weapons: z.record(str, z.unknown()),
  accessories: z.record(str, z.unknown()),
  consumables: z.record(str, z.unknown()),
  ammunition: z.record(str, z.unknown()),
  crafting: z.record(str, z.unknown()).default({}),
  keyitems: z.record(str, z.unknown()).default({}),
  spells: z.record(str, z.unknown()),
  terrain: z.record(str, z.unknown()),
  gridshapes: z.record(str, z.unknown()).default({}),
  partyList: z.unknown(),
  uiPrefs: z.unknown(),
  enemyTags: z.unknown().default([]),
});
export type RawAssetBundle = z.infer<typeof rawAssetBundleSchema>;
