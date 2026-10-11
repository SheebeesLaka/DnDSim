/**
 * Raw JSON → normalised asset records, reproducing the Java load path:
 * Gson field defaults (constructor defaults only for Spell / Enemy / ItemAbility,
 * which have no-arg constructors; zero/null otherwise), the explicit fix-ups in
 * CharSheet.load(), Spell.normalize(), Enemy.ensureAttributes() and the lazy
 * getters that pad arrays. Unknown keys are kept in `extra`.
 */
import { DEFAULT_COLOR, defaultItemColor, fromLegacyIndex, normalizeHex } from './color.ts';
import {
  rawAccessorySchema,
  rawAmmunitionSchema,
  rawCharSheetSchema,
  rawConsumableSchema,
  rawCraftingItemSchema,
  rawEnemySchema,
  rawGridShapePresetSchema,
  rawItemAbilitySchema,
  rawKeyItemSchema,
  rawPlainItemSchema,
  rawSpellSchema,
  rawStatusSchema,
  rawTerrainSchema,
  rawWeaponSchema,
  type RawCharSheet,
  type RawEnemy,
  type RawGridShapePreset,
  type RawItemAbility,
  type RawSpell,
  type RawStatus,
  type RawTerrain,
} from './schemas.ts';
import {
  ATTRIBUTE_COUNT,
  SpellArea,
  SpellResolution,
  SpellTarget,
  type AccessoryDef,
  type AmmunitionDef,
  type Attributes6,
  type CharSheetDef,
  type ConsumableDef,
  type CraftingItemDef,
  type DiceTiers,
  type EnemyDef,
  type Extra,
  type GridShapePresetDef,
  type ItemAbilityDef,
  type ItemDef,
  type KeyItemDef,
  type PlainItemDef,
  type SpellDef,
  type StatusDef,
  type TerrainDef,
  type WeaponDef,
} from './types.ts';

// ---------- helpers ----------

function pickExtra(raw: Record<string, unknown>, known: readonly string[]): Extra {
  const extra: Extra = {};
  for (const key of Object.keys(raw)) if (!known.includes(key)) extra[key] = raw[key];
  return extra;
}

const knownKeys = <T extends Record<string, unknown>>(schema: { shape: T }): string[] =>
  Object.keys(schema.shape);

/** CharSheet.normalizeAttributeArray: pad/truncate to 6, null → zeros. */
export function normalizeAttributeArray(values: readonly number[] | null | undefined): Attributes6 {
  const out: Attributes6 = [0, 0, 0, 0, 0, 0];
  if (values) for (let i = 0; i < Math.min(ATTRIBUTE_COUNT, values.length); i++) out[i] = values[i] ?? 0;
  return out;
}

/** CharSheet.normalizeBaseAttributes: 4-element legacy [STR, DEX, MOB, INT] → 6 (MOB dropped). */
export function normalizeBaseAttributes(values: readonly number[] | null | undefined): Attributes6 {
  if (!values) return [0, 0, 0, 0, 0, 0];
  if (values.length === 4) return [values[0] ?? 0, values[1] ?? 0, 0, values[3] ?? 0, 0, 0];
  return normalizeAttributeArray(values);
}

/** Pad a dice array to exactly three tiers; blanks become null. */
export function padDice(dice: readonly (string | null | undefined)[] | null | undefined): DiceTiers {
  const out: DiceTiers = [null, null, null];
  if (dice) for (let i = 0; i < 3; i++) out[i] = i < dice.length ? (dice[i] ?? null) : null;
  return out;
}

const int = (v: number | null | undefined, dflt = 0): number =>
  v === null || v === undefined ? dflt : Math.trunc(v);

// ---------- Status / ItemAbility ----------

/**
 * Status has no no-arg constructor, so Gson leaves missing fields at 0 / null
 * (a status JSON without `duration` loads as duration 0, which never expires).
 */
export function normalizeStatus(input: unknown): StatusDef {
  const raw: RawStatus = rawStatusSchema.parse(input);
  return {
    name: raw.name ?? '',
    effectType: int(raw.effectType),
    magnitude: int(raw.magnitude),
    duration: int(raw.duration),
    targetAttribute: int(raw.targetAttribute),
    extra: pickExtra(raw, knownKeys(rawStatusSchema)),
  };
}

/** ItemAbility has a no-arg constructor: missing fields keep its defaults; explicit nulls win. */
export function normalizeItemAbility(input: unknown): ItemAbilityDef {
  const raw: RawItemAbility = rawItemAbilitySchema.parse(input);
  const dflt = <T>(v: T | null | undefined, d: T): T => (v === undefined ? d : (v as T));
  return {
    name: dflt(raw.name, 'Unnamed Ability') ?? '',
    description: dflt(raw.description, '') ?? '',
    triggerType: dflt(raw.triggerType, 'ON_TURN_START') ?? '',
    effectType: dflt(raw.effectType, 'HEAL') ?? '',
    magnitude: int(raw.magnitude),
    targetAttribute: int(raw.targetAttribute),
    statusName: raw.statusName ?? null,
    // getAbilityType(): null → PASSIVE
    abilityType: raw.abilityType ?? 'PASSIVE',
    extra: pickExtra(raw, knownKeys(rawItemAbilitySchema)),
  };
}

// ---------- Items ----------

function itemBase(
  raw: {
    name?: string | null;
    type?: string | null;
    color?: string | number | null;
    quantity?: number | null;
  },
  kindType: string,
) {
  const type = raw.type ?? kindType;
  return {
    name: raw.name ?? '',
    type,
    // Item.getColor() normalises lazily with the type default as fallback
    color: normalizeHex(raw.color, defaultItemColor(type)),
    quantity: int(raw.quantity),
  };
}

/** Weapon.convertLegacyDamage. */
export function weaponDiceFromLegacyDamage(damage: number): DiceTiers {
  if (damage <= 3) return ['d4', 'd4', 'd6'];
  if (damage <= 6) return ['d6', 'd6', 'd8'];
  if (damage <= 10) return ['d6', 'd6', 'd10'];
  return ['d8', 'd8', 'd12'];
}

export function normalizeWeapon(input: unknown): WeaponDef {
  const raw = rawWeaponSchema.parse(input);
  const legacyDamage = int(raw.damage);
  // Weapon.getDamageDice(): null array + legacy damage → converted; null → d4/d4/d6
  const dice: DiceTiers =
    raw.damageDice && raw.damageDice.length > 0
      ? padDice(raw.damageDice)
      : legacyDamage > 0
        ? weaponDiceFromLegacyDamage(legacyDamage)
        : ['d4', 'd4', 'd6'];
  return {
    kind: 'weapon',
    ...itemBase(raw, 'Weapon'),
    damageDice: dice,
    statType: raw.statType ?? 'STRENGTH',
    ammoType: raw.ammoType ?? null,
    modifiedAttributes: normalizeAttributeArray(raw.modifiedAttributes),
    abilities: (raw.abilities ?? []).map(normalizeItemAbility),
    legacyDamage,
    extra: pickExtra(raw, knownKeys(rawWeaponSchema)),
  };
}

export function normalizeAccessory(input: unknown): AccessoryDef {
  const raw = rawAccessorySchema.parse(input);
  return {
    kind: 'accessory',
    ...itemBase(raw, 'Accessory'),
    defense: int(raw.defense),
    modifiedAttributes: normalizeAttributeArray(raw.modifiedAttributes),
    abilities: (raw.abilities ?? []).map(normalizeItemAbility),
    legacyArmorType: int(raw.armorType),
    extra: pickExtra(raw, knownKeys(rawAccessorySchema)),
  };
}

export function normalizeConsumable(input: unknown): ConsumableDef {
  const raw = rawConsumableSchema.parse(input);
  return {
    kind: 'consumable',
    ...itemBase(raw, 'Consumable'),
    healAmount: int(raw.healAmount),
    effect: raw.effect ? normalizeStatus(raw.effect) : null,
    extra: pickExtra(raw, knownKeys(rawConsumableSchema)),
  };
}

export function normalizeAmmunition(input: unknown): AmmunitionDef {
  const raw = rawAmmunitionSchema.parse(input);
  return {
    kind: 'ammunition',
    ...itemBase(raw, 'Ammunition'),
    ammoType: raw.ammoType ?? null,
    legacyCompatibleWeaponType: raw.compatibleWeaponType ?? null,
    legacyDamageBonus: int(raw.damageBonus),
    extra: pickExtra(raw, knownKeys(rawAmmunitionSchema)),
  };
}

export function normalizeCraftingItem(input: unknown): CraftingItemDef {
  const raw = rawCraftingItemSchema.parse(input);
  return {
    kind: 'crafting',
    ...itemBase(raw, 'Crafting'),
    craftingCategory: raw.craftingCategory ?? null,
    description: raw.description ?? null,
    extra: pickExtra(raw, knownKeys(rawCraftingItemSchema)),
  };
}

export function normalizeKeyItem(input: unknown): KeyItemDef {
  const raw = rawKeyItemSchema.parse(input);
  return {
    kind: 'keyitem',
    ...itemBase(raw, 'Key Item'),
    description: raw.description ?? null,
    questRelated: raw.questRelated ?? false,
    extra: pickExtra(raw, knownKeys(rawKeyItemSchema)),
  };
}

export function normalizePlainItem(input: unknown): PlainItemDef {
  const raw = rawPlainItemSchema.parse(input);
  return { kind: 'item', ...itemBase(raw, ''), extra: pickExtra(raw, knownKeys(rawPlainItemSchema)) };
}

/** ItemTypeAdapter.deserialize: dispatch on the `type` string. */
export function normalizeInventoryItem(input: unknown): ItemDef {
  const type = (input as { type?: unknown } | null)?.type;
  switch (typeof type === 'string' ? type : '') {
    case 'Weapon':
      return normalizeWeapon(input);
    case 'Accessory':
    case 'Armor':
      return normalizeAccessory(input);
    case 'Consumable':
      return normalizeConsumable(input);
    case 'Ammunition':
      return normalizeAmmunition(input);
    case 'Crafting Item':
    case 'CraftingItem':
    case 'Crafting': // what the Java asset editor wrote; its own adapter dropped it to a plain Item (F-47)
      return normalizeCraftingItem(input);
    case 'Key Item':
    case 'KeyItem':
      return normalizeKeyItem(input);
    default:
      // anything unrecognised
      return normalizePlainItem(input);
  }
}

// ---------- CharSheet ----------

const CHARSHEET_KNOWN = [...knownKeys(rawCharSheetSchema), 'PRIMARY', 'SECONDARY'];

/** CharSheet.load() fix-ups applied to a raw party/non-party sheet. */
export function normalizeCharSheet(input: unknown): CharSheetDef {
  const raw: RawCharSheet = rawCharSheetSchema.parse(input);
  const weapons = raw.weapons ?? [];
  const accessories = raw.accessories ?? [];
  const slotsUsed =
    raw.spellSlotsUsed && raw.spellSlotsUsed.length === 9
      ? raw.spellSlotsUsed.map((n) => int(n))
      : new Array<number>(9).fill(0);
  const level = int(raw.level);
  const armorClass = int(raw.armorClass);
  return {
    name: raw.name ?? '',
    characterClass: raw.characterClass ?? 'None',
    color: normalizeHex(raw.color, DEFAULT_COLOR),
    isParty: raw.isParty ?? false,
    spritePath: raw.spritePath ?? null,
    level: level <= 0 ? 1 : level,
    group: raw.group === 'OMEGA' || raw.group === 'ALPHA' || raw.group === 'NPC' ? raw.group : null,
    totalHP: int(raw.totalHP),
    currentHP: int(raw.currentHP),
    armorClass: armorClass === 0 ? 10 : armorClass,
    status: (raw.status ?? []).map(normalizeStatus),
    baseAttributes: normalizeBaseAttributes(raw.baseAttributes),
    tempAttributes: normalizeAttributeArray(raw.tempAttributes),
    totalAttributes: normalizeAttributeArray(raw.totalAttributes),
    weapons: [
      weapons[0] ? normalizeWeapon(weapons[0]) : null,
      weapons[1] ? normalizeWeapon(weapons[1]) : null,
    ],
    accessories: [
      accessories[0] ? normalizeAccessory(accessories[0]) : null,
      accessories[1] ? normalizeAccessory(accessories[1]) : null,
      accessories[2] ? normalizeAccessory(accessories[2]) : null,
    ],
    inventory: (raw.inventory ?? []).map(normalizeInventoryItem),
    wallet: int(raw.wallet),
    abilities: (raw.abilities ?? []).map(normalizeItemAbility),
    spellcastingStat: raw.spellcastingStat && raw.spellcastingStat !== '' ? raw.spellcastingStat : null,
    knownSpells: [...(raw.knownSpells ?? [])],
    spellSlotsUsed: slotsUsed,
    extra: pickExtra(raw, CHARSHEET_KNOWN),
  };
}

// ---------- Enemy ----------

/** Enemy.convertLegacyDamage (different thresholds from Weapon's). */
export function enemyDiceFromLegacyDamage(damage: number): DiceTiers {
  if (damage <= 2) return ['d4', 'd4', 'd4'];
  if (damage <= 4) return ['d4', 'd4', 'd6'];
  if (damage <= 6) return ['d6', 'd6', 'd8'];
  return ['d6', 'd8', 'd10'];
}

/** Enemy.load(): no-arg constructor defaults, baseName = name, legacy dice conversion. */
export function normalizeEnemy(input: unknown, fileStem: string): EnemyDef {
  const raw: RawEnemy = rawEnemySchema.parse(input);
  const legacyAttackDamage = int(raw.attackDamage);
  const dexterity = int(raw.dexterity);
  const dice: DiceTiers =
    raw.damageDice && raw.damageDice.length > 0
      ? padDice(raw.damageDice)
      : legacyAttackDamage > 0
        ? enemyDiceFromLegacyDamage(legacyAttackDamage)
        : ['d4', 'd4', 'd6'];
  // ensureAttributes: missing/short → each missing slot defaults to dexterity
  let attributes: Attributes6 | null = null;
  if (raw.attributes) {
    attributes = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6; i++)
      attributes[i] = i < raw.attributes.length ? int(raw.attributes[i]) : dexterity;
  }
  const name = raw.name ?? '';
  return {
    fileStem,
    name,
    baseName: name,
    health: int(raw.health),
    maxHealth: int(raw.maxHealth),
    mobility: int(raw.mobility),
    armorClass: int(raw.armorClass),
    damageDice: dice,
    dexterity,
    color: normalizeHex(raw.color, DEFAULT_COLOR),
    spritePath: raw.spritePath ?? null,
    tags: [...(raw.tags ?? [])],
    attributes,
    instanceNumber: int(raw.instanceNumber),
    legacyAttackDamage,
    row: int(raw.row),
    col: int(raw.col),
    extra: pickExtra(raw, knownKeys(rawEnemySchema)),
  };
}

// ---------- Spell ----------

const RESOLUTIONS = Object.values(SpellResolution) as string[];
const TARGETS = Object.values(SpellTarget) as string[];
const AREAS = Object.values(SpellArea) as string[];

/** Spell(): constructor defaults for missing keys, then Spell.normalize(). */
export function normalizeSpell(input: unknown): SpellDef {
  const raw: RawSpell = rawSpellSchema.parse(input);
  const d = <T>(v: T | null | undefined, ctor: T): T | null => (v === undefined ? ctor : v);

  let resolution = d(raw.resolution, 'ATTACK') ?? 'ATTACK';
  if (!RESOLUTIONS.includes(resolution)) resolution = 'ATTACK';
  const isFriendly = resolution === 'HEAL' || resolution === 'BUFF';

  let targetType = d(raw.targetType, 'ENEMY') ?? (isFriendly ? 'ALLY' : 'ENEMY');
  if (!TARGETS.includes(targetType)) targetType = 'ENEMY';

  let area = d(raw.area, 'NONE') ?? 'NONE';
  if (!AREAS.includes(area)) area = 'NONE';
  const isArea = area !== 'NONE';

  const ctorDice: DiceTiers = ['d10', null, null];
  const damageDice = raw.damageDice === undefined ? ctorDice : padDice(raw.damageDice);

  let areaSize = int(d(raw.areaSize, 2));
  if (isArea && areaSize < 1) areaSize = 1;
  const riderMinTier = Math.max(1, int(d(raw.riderMinTier, 1)));
  const level = Math.max(0, Math.min(9, int(raw.level)));
  const range = Math.max(0, int(d(raw.range, 6)));
  const onSave = (d(raw.onSave, 'NONE') ?? 'NONE') === 'HALF' ? 'HALF' : 'NONE';

  return {
    name: d(raw.name, 'New Spell') ?? 'Unnamed Spell',
    description: d(raw.description, '') ?? '',
    color: normalizeHex(d(raw.color, '#7B68EE'), '#7B68EE'),
    level,
    school: d(raw.school, 'Evocation') ?? '',
    resolution: resolution as SpellDef['resolution'],
    range,
    targetType: targetType as SpellDef['targetType'],
    damageDice,
    saveStat: d(raw.saveStat, 'DEXTERITY') ?? 'DEXTERITY',
    onSave,
    upcastDie: raw.upcastDie ?? null,
    riderStatus: raw.riderStatus ? normalizeStatus(raw.riderStatus) : null,
    riderMinTier,
    addCastingMod: raw.addCastingMod ?? false,
    flatDamage: int(raw.flatDamage),
    area: area as SpellDef['area'],
    areaSize,
    friendlyFire: raw.friendlyFire ?? false,
    extra: pickExtra(raw, knownKeys(rawSpellSchema)),
  };
}

// ---------- Terrain ----------

/**
 * TerrainObject has no no-arg constructor, so Gson would leave a missing
 * `collision` / `entityAboveTerrain` at false (FEATURES.md R15.10, F-50). The
 * port applies the class defaults (true / true) instead; every shipped file
 * sets both explicitly, so nothing observable changes.
 */
export function normalizeTerrain(input: unknown): TerrainDef {
  const raw: RawTerrain = rawTerrainSchema.parse(input);
  return {
    type: raw.type && raw.type.trim() !== '' ? raw.type.trim() : 'Generic',
    health: int(raw.health),
    color: normalizeHex(raw.color, fromLegacyIndex(8)),
    collision: raw.collision ?? true,
    entityAboveTerrain: raw.entityAboveTerrain ?? true,
    spritePath: raw.spritePath ?? null,
    row: int(raw.row),
    col: int(raw.col),
    extra: pickExtra(raw, knownKeys(rawTerrainSchema)),
  };
}

// ---------- Grid shape preset ----------

export function normalizeGridShapePreset(input: unknown): GridShapePresetDef {
  const raw: RawGridShapePreset = rawGridShapePresetSchema.parse(input);
  return {
    name: raw.name ?? '',
    rows: int(raw.rows),
    cols: int(raw.cols),
    mask: (raw.mask ?? []).map((row) => [...row]),
    extra: pickExtra(raw, knownKeys(rawGridShapePresetSchema)),
  };
}
