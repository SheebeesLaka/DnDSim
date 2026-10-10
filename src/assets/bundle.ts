/**
 * Turn the raw /api/assets payload into a normalised AssetBundle, mirroring
 * how the Java singletons (ItemDatabase, SpellDatabase, TerrainDatabase,
 * GridShapePresetDatabase, PartyConfig, UiPreferences, Enemy.listSavedEnemies)
 * build their in-memory registries. Per-file failures are collected in
 * `problems` rather than aborting the load.
 */
import {
  normalizeAccessory,
  normalizeAmmunition,
  normalizeCharSheet,
  normalizeConsumable,
  normalizeCraftingItem,
  normalizeEnemy,
  normalizeGridShapePreset,
  normalizeKeyItem,
  normalizeSpell,
  normalizeTerrain,
  normalizeWeapon,
} from './normalize.ts';
import { rawAssetBundleSchema, rawEnemyTagsSchema, rawPartyListSchema, rawUiPrefsSchema } from './schemas.ts';
import type { AssetBundle, TerrainDef } from './types.ts';

type Problems = AssetBundle['problems'];

function each<T>(
  folder: Record<string, unknown>,
  path: string,
  problems: Problems,
  fn: (raw: unknown, stem: string) => T,
  onOk: (value: T, stem: string) => void,
): void {
  for (const stem of Object.keys(folder).sort()) {
    const raw = folder[stem];
    if (raw && typeof raw === 'object' && '__parseError' in raw) {
      problems.push({ path: `${path}/${stem}.json`, message: 'malformed JSON' });
      continue;
    }
    try {
      onOk(fn(raw, stem), stem);
    } catch (err) {
      problems.push({
        path: `${path}/${stem}.json`,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function normalizeBundle(input: unknown): AssetBundle {
  const raw = rawAssetBundleSchema.parse(input);
  const problems: Problems = [];
  const bundle: AssetBundle = {
    party: {},
    partyStems: {},
    enemies: {},
    weapons: {},
    accessories: {},
    consumables: {},
    ammunition: {},
    crafting: {},
    keyitems: {},
    spells: {},
    terrain: [],
    gridshapes: [],
    partyList: [],
    uiPrefs: {},
    enemyTags: [],
    problems,
  };

  each(raw.party, 'saves/entities/party', problems, normalizeCharSheet, (sheet, stem) => {
    bundle.party[sheet.name] = sheet;
    bundle.partyStems[sheet.name] = stem;
  });
  each(raw.enemies, 'saves/entities/enemies', problems, normalizeEnemy, (enemy, stem) => {
    bundle.enemies[stem] = enemy;
  });
  // ItemDatabase: HashMap keyed by name; a later file with the same name wins.
  each(raw.weapons, 'saves/items/weapons', problems, normalizeWeapon, (w) => (bundle.weapons[w.name] = w));
  each(
    raw.accessories,
    'saves/items/accessories',
    problems,
    normalizeAccessory,
    (a) => (bundle.accessories[a.name] = a),
  );
  each(
    raw.consumables,
    'saves/items/consumables',
    problems,
    normalizeConsumable,
    (c) => (bundle.consumables[c.name] = c),
  );
  each(
    raw.ammunition,
    'saves/items/ammunition',
    problems,
    normalizeAmmunition,
    (a) => (bundle.ammunition[a.name] = a),
  );
  each(
    raw.crafting,
    'saves/items/crafting',
    problems,
    normalizeCraftingItem,
    (c) => (bundle.crafting[c.name] = c),
  );
  each(
    raw.keyitems,
    'saves/items/keyitems',
    problems,
    normalizeKeyItem,
    (k) => (bundle.keyitems[k.name] = k),
  );
  // ItemDatabase.addDefaultItems when weapons, accessories and consumables are all empty
  if (
    Object.keys(bundle.weapons).length === 0 &&
    Object.keys(bundle.accessories).length === 0 &&
    Object.keys(bundle.consumables).length === 0
  ) {
    bundle.weapons.Sword = normalizeWeapon({
      name: 'Sword',
      type: 'Weapon',
      damage: 5,
      modifiedAttributes: [1, 0, 0, 0],
      quantity: 1,
    });
    bundle.weapons.Dagger = normalizeWeapon({
      name: 'Dagger',
      type: 'Weapon',
      damage: 3,
      modifiedAttributes: [0, 1, 0, 0],
      quantity: 1,
    });
    bundle.consumables['Health Potion'] = normalizeConsumable({
      name: 'Health Potion',
      type: 'Consumable',
      healAmount: 10,
      quantity: 1,
    });
  }
  each(raw.spells, 'saves/spells', problems, normalizeSpell, (s) => (bundle.spells[s.name] = s));
  each(raw.terrain, 'saves/terrain', problems, normalizeTerrain, (t) => bundle.terrain.push(t));
  if (bundle.terrain.length === 0) {
    const dflt = (type: string, health: number): TerrainDef =>
      normalizeTerrain({ type, health, row: 0, col: 0, collision: true, entityAboveTerrain: true });
    bundle.terrain.push(dflt('Rock', 10), dflt('Tree', 5));
  }
  each(raw.gridshapes, 'saves/gridshapes', problems, normalizeGridShapePreset, (p) =>
    bundle.gridshapes.push(p),
  );

  const partyList = rawPartyListSchema.safeParse(raw.partyList);
  bundle.partyList = partyList.success ? partyList.data : [];
  if (!partyList.success) problems.push({ path: 'saves/party.json', message: 'expected an array of names' });

  const prefs = rawUiPrefsSchema.safeParse(raw.uiPrefs);
  if (prefs.success) {
    for (const [k, v] of Object.entries(prefs.data)) if (v !== null) bundle.uiPrefs[k] = String(v);
  } else {
    problems.push({ path: 'saves/ui_prefs.json', message: 'expected a flat object' });
  }

  const tags = rawEnemyTagsSchema.safeParse(raw.enemyTags);
  bundle.enemyTags = tags.success ? tags.data : [];
  return bundle;
}
