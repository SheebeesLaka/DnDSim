/**
 * Normalised records → the JSON the Java app expects. Keys follow Gson's
 * declared-field order (subclass fields first, then superclass), null fields
 * are omitted (Gson default) while nulls inside arrays are kept. When the
 * original raw object is supplied as `template`, its key order is reused so a
 * load/save round-trip is structurally identical; keys Java never wrote are
 * appended. Byte identity is not a goal (Gson escapes `'` as ').
 */
import type {
  AccessoryDef,
  AmmunitionDef,
  CharSheetDef,
  ConsumableDef,
  CraftingItemDef,
  EnemyDef,
  GridShapePresetDef,
  ItemAbilityDef,
  ItemDef,
  KeyItemDef,
  PlainItemDef,
  SpellDef,
  StatusDef,
  TerrainDef,
  WeaponDef,
} from './types.ts';

type Json = Record<string, unknown>;

/** Build an object from [key, value] pairs, dropping null/undefined (Gson omits nulls). */
function obj(pairs: [string, unknown][], extra: Record<string, unknown> = {}): Json {
  const out: Json = {};
  for (const [k, v] of pairs) if (v !== null && v !== undefined) out[k] = v;
  for (const [k, v] of Object.entries(extra)) if (!(k in out) && v !== undefined) out[k] = v;
  return out;
}

export function statusToJson(s: StatusDef): Json {
  return obj(
    [
      ['name', s.name],
      ['effectType', s.effectType],
      ['magnitude', s.magnitude],
      ['duration', s.duration],
      ['targetAttribute', s.targetAttribute],
    ],
    s.extra,
  );
}

export function itemAbilityToJson(a: ItemAbilityDef): Json {
  return obj(
    [
      ['name', a.name],
      ['description', a.description],
      ['triggerType', a.triggerType],
      ['effectType', a.effectType],
      ['magnitude', a.magnitude],
      ['targetAttribute', a.targetAttribute],
      ['statusName', a.statusName],
      ['abilityType', a.abilityType],
    ],
    a.extra,
  );
}

const base = (i: { name: string; type: string; color: string; quantity: number }): [string, unknown][] => [
  ['name', i.name],
  ['type', i.type],
  ['color', i.color],
  ['quantity', i.quantity],
];

export function weaponToJson(w: WeaponDef): Json {
  return obj(
    [
      ['damageDice', w.damageDice],
      ['statType', w.statType],
      ['ammoType', w.ammoType],
      ['modifiedAttributes', w.modifiedAttributes],
      ['abilities', w.abilities.map(itemAbilityToJson)],
      ['damage', w.legacyDamage],
      ...base(w),
    ],
    w.extra,
  );
}

export function accessoryToJson(a: AccessoryDef): Json {
  return obj(
    [
      ['defense', a.defense],
      ['modifiedAttributes', a.modifiedAttributes],
      ['abilities', a.abilities.map(itemAbilityToJson)],
      ['armorType', a.legacyArmorType],
      ...base(a),
    ],
    a.extra,
  );
}

export function consumableToJson(c: ConsumableDef): Json {
  return obj(
    [['healAmount', c.healAmount], ['effect', c.effect ? statusToJson(c.effect) : null], ...base(c)],
    c.extra,
  );
}

export function ammunitionToJson(a: AmmunitionDef): Json {
  return obj(
    [
      ['ammoType', a.ammoType],
      ['damageBonus', a.legacyDamageBonus],
      ['compatibleWeaponType', a.legacyCompatibleWeaponType],
      ...base(a),
    ],
    a.extra,
  );
}

export function craftingItemToJson(c: CraftingItemDef): Json {
  return obj([['craftingCategory', c.craftingCategory], ['description', c.description], ...base(c)], c.extra);
}

export function keyItemToJson(k: KeyItemDef): Json {
  return obj([['description', k.description], ['questRelated', k.questRelated], ...base(k)], k.extra);
}

export function plainItemToJson(i: PlainItemDef): Json {
  return obj(base(i), i.extra);
}

export function itemToJson(item: ItemDef): Json {
  switch (item.kind) {
    case 'weapon':
      return weaponToJson(item);
    case 'accessory':
      return accessoryToJson(item);
    case 'consumable':
      return consumableToJson(item);
    case 'ammunition':
      return ammunitionToJson(item);
    case 'crafting':
      return craftingItemToJson(item);
    case 'keyitem':
      return keyItemToJson(item);
    case 'item':
      return plainItemToJson(item);
  }
}

export function charSheetToJson(s: CharSheetDef): Json {
  return obj(
    [
      ['name', s.name],
      ['characterClass', s.characterClass],
      ['color', s.color],
      ['isParty', s.isParty],
      ['spritePath', s.spritePath],
      ['level', s.level],
      ['group', s.group],
      ['totalHP', s.totalHP],
      ['currentHP', s.currentHP],
      ['armorClass', s.armorClass],
      ['status', s.status.map(statusToJson)],
      ['baseAttributes', s.baseAttributes],
      ['tempAttributes', s.tempAttributes],
      ['totalAttributes', s.totalAttributes],
      ['weapons', s.weapons.map((w) => (w ? weaponToJson(w) : null))],
      // Non-static finals Java always writes (FEATURES.md F-49)
      ['PRIMARY', 0],
      ['SECONDARY', 1],
      ['accessories', s.accessories.map((a) => (a ? accessoryToJson(a) : null))],
      ['inventory', s.inventory.map(itemToJson)],
      ['wallet', s.wallet],
      ['abilities', s.abilities.map(itemAbilityToJson)],
      ['spellcastingStat', s.spellcastingStat],
      ['knownSpells', s.knownSpells],
      ['spellSlotsUsed', s.spellSlotsUsed],
    ],
    s.extra,
  );
}

export function enemyToJson(e: EnemyDef): Json {
  return obj(
    [
      ['name', e.name],
      ['health', e.health],
      ['maxHealth', e.maxHealth],
      ['mobility', e.mobility],
      ['armorClass', e.armorClass],
      ['damageDice', e.damageDice],
      ['dexterity', e.dexterity],
      ['color', e.color],
      ['instanceNumber', e.instanceNumber],
      ['baseName', e.baseName],
      ['spritePath', e.spritePath],
      ['tags', e.tags],
      ['attributes', e.attributes],
      ['attackDamage', e.legacyAttackDamage],
      ['row', e.row],
      ['col', e.col],
    ],
    e.extra,
  );
}

export function spellToJson(s: SpellDef): Json {
  return obj(
    [
      ['name', s.name],
      ['description', s.description],
      ['color', s.color],
      ['level', s.level],
      ['school', s.school],
      ['resolution', s.resolution],
      ['range', s.range],
      ['targetType', s.targetType],
      ['damageDice', s.damageDice],
      ['saveStat', s.saveStat],
      ['onSave', s.onSave],
      ['upcastDie', s.upcastDie],
      ['riderStatus', s.riderStatus ? statusToJson(s.riderStatus) : null],
      ['riderMinTier', s.riderMinTier],
      ['addCastingMod', s.addCastingMod],
      ['flatDamage', s.flatDamage],
      ['area', s.area],
      ['areaSize', s.areaSize],
      ['friendlyFire', s.friendlyFire],
    ],
    s.extra,
  );
}

export function terrainToJson(t: TerrainDef): Json {
  return obj(
    [
      ['type', t.type],
      ['health', t.health],
      ['color', t.color],
      ['collision', t.collision],
      ['entityAboveTerrain', t.entityAboveTerrain],
      ['spritePath', t.spritePath],
      ['row', t.row],
      ['col', t.col],
    ],
    t.extra,
  );
}

export function gridShapePresetToJson(p: GridShapePresetDef): Json {
  return obj(
    [
      ['name', p.name],
      ['rows', p.rows],
      ['cols', p.cols],
      ['mask', p.mask],
    ],
    p.extra,
  );
}

/**
 * Reorder `value`'s keys to follow `template`'s (recursively, arrays element-wise).
 * Keys missing from the template keep their relative order after the templated ones.
 */
export function orderLike(value: unknown, template: unknown): unknown {
  if (Array.isArray(value)) {
    const t = Array.isArray(template) ? template : [];
    return value.map((v, i) => orderLike(v, t[i]));
  }
  if (value && typeof value === 'object') {
    const v = value as Json;
    const t =
      template && typeof template === 'object' && !Array.isArray(template) ? (template as Json) : null;
    const out: Json = {};
    if (t) for (const k of Object.keys(t)) if (k in v) out[k] = orderLike(v[k], t[k]);
    for (const k of Object.keys(v)) if (!(k in out)) out[k] = orderLike(v[k], t?.[k]);
    return out;
  }
  return value;
}

/** Gson compact (`new Gson()`) vs pretty (`setPrettyPrinting`, 2 spaces) per file type. */
export const PRETTY: Record<string, boolean> = {
  party: false,
  nonparty: false,
  enemy: true,
  weapon: false,
  accessory: false,
  consumable: false,
  ammunition: false,
  crafting: false,
  keyitem: false,
  spell: true,
  terrain: false,
  gridshape: false,
  partyList: true,
  uiPrefs: true,
  enemyTags: true,
};

export function stringifyLike(kind: keyof typeof PRETTY, json: unknown, template?: unknown): string {
  const ordered = template === undefined ? json : orderLike(json, template);
  return PRETTY[kind] ? JSON.stringify(ordered, null, 2) : JSON.stringify(ordered);
}
