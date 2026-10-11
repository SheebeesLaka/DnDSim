import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeBundle } from '../../src/assets/bundle.ts';
import { normalizeCharSheet, normalizeInventoryItem } from '../../src/assets/normalize.ts';
import { AssetStore, type AssetChange, type RawFolders } from '../../src/editors/assetStore.ts';
import { newCharacter, newEnemy, newItem, newSpell, newTerrain } from '../../src/editors/defaults.ts';
import { rawBundleFromDisk, readSave } from '../helpers/saves.ts';

/** In-memory saves/: path → text; deletes remove the key. */
class MemoryIO {
  files = new Map<string, string>();
  async put(path: string, text: string) {
    await Promise.resolve();
    this.files.set(path, text);
  }
  async del(path: string) {
    await Promise.resolve();
    this.files.delete(path);
  }
}

let io: MemoryIO;
let store: AssetStore;
let changes: AssetChange[];

beforeEach(() => {
  const raw = rawBundleFromDisk();
  io = new MemoryIO();
  store = new AssetStore(normalizeBundle(raw), raw as RawFolders, io);
  changes = [];
  store.subscribe((c) => changes.push(c));
});

const json = (path: string) => JSON.parse(io.files.get(path) ?? 'null') as Record<string, unknown>;
const ops = () => store.writes.map((w) => `${w.op} ${w.path}`);

describe('spells', () => {
  it('creates a spell file in the Java format and refuses missing/duplicate names', async () => {
    const s = { ...newSpell(), name: 'Frost Ray', level: 1 };
    expect(store.saveSpell(s, null)).toEqual({ ok: true });
    await store.flush();
    expect(json('spells/Frost_Ray.json')).toMatchObject({
      name: 'Frost Ray',
      level: 1,
      resolution: 'ATTACK',
    });
    // pretty-printed like Gson's setPrettyPrinting
    expect(io.files.get('spells/Frost_Ray.json')).toContain('\n  "name": "Frost Ray"');
    expect(store.saveSpell({ ...newSpell(), name: '  ' }, null)).toMatchObject({
      ok: false,
      title: 'Missing Name',
    });
    expect(store.saveSpell({ ...newSpell(), name: 'Fireball' }, null)).toMatchObject({
      ok: false,
      title: 'Duplicate Name',
      message: 'A spell named Fireball already exists.',
    });
    // two names that sanitise to the same file
    expect(store.saveSpell({ ...newSpell(), name: 'Frost-Ray' }, null)).toMatchObject({
      ok: false,
      title: 'Duplicate Name',
    });
  });

  it('renaming moves the file and rewrites the name in every sheet that knows it', async () => {
    const knower = Object.values(store.bundle.party).find((p) => p.knownSpells.includes('Fire Bolt'));
    expect(knower).toBeDefined();
    const spell = store.bundle.spells['Fire Bolt'];
    if (!spell || !knower) throw new Error('fixture');
    expect(store.saveSpell({ ...spell, name: 'Fire Lance' }, 'Fire Bolt')).toEqual({ ok: true });
    await store.flush();
    expect(ops()).toContain('del spells/Fire_Bolt.json');
    expect(io.files.has('spells/Fire_Lance.json')).toBe(true);
    expect(store.bundle.spells['Fire Bolt']).toBeUndefined();
    expect(store.bundle.party[knower.name]?.knownSpells).toContain('Fire Lance');
    const sheetFile = json(`entities/party/${store.bundle.partyStems[knower.name] ?? ''}.json`);
    expect(sheetFile.knownSpells).toContain('Fire Lance');
    expect(sheetFile.knownSpells).not.toContain('Fire Bolt');
  });

  it('deleting removes the file; knowers keep the dangling name (Java)', async () => {
    const knower = Object.values(store.bundle.party).find((p) => p.knownSpells.includes('Fire Bolt'));
    store.deleteSpell('Fire Bolt');
    await store.flush();
    expect(ops()).toEqual(['del spells/Fire_Bolt.json']);
    expect(store.bundle.party[knower?.name ?? '']?.knownSpells).toContain('Fire Bolt');
    expect(changes).toEqual([{ kind: 'spell' }]);
  });
});

describe('items', () => {
  it('writes each kind to its folder, compact, with Java type strings', async () => {
    for (const kind of ['weapon', 'accessory', 'consumable', 'ammunition', 'crafting', 'keyitem'] as const)
      expect(store.saveItem({ ...newItem(kind), name: `Test ${kind}` }, null)).toEqual({ ok: true });
    await store.flush();
    expect(json('items/weapons/Test_weapon.json')).toMatchObject({
      type: 'Weapon',
      damageDice: ['d6', 'd6', 'd8'],
      statType: 'STRENGTH',
      quantity: 1,
    });
    expect(json('items/accessories/Test_accessory.json')).toMatchObject({ type: 'Accessory', defense: 1 });
    expect(json('items/consumables/Test_consumable.json')).toMatchObject({
      type: 'Consumable',
      healAmount: 10,
    });
    expect(json('items/ammunition/Test_ammunition.json')).toMatchObject({
      type: 'Ammunition',
      ammoType: '12 Gauge',
    });
    expect(json('items/keyitems/Test_keyitem.json')).toMatchObject({ type: 'Key Item', questRelated: false });
    // F-47: crafting items are written with the type the inventory loader recognises
    const crafting = json('items/crafting/Test_crafting.json');
    expect(crafting.type).toBe('Crafting Item');
    expect(normalizeInventoryItem(crafting).kind).toBe('crafting');
    expect(io.files.get('items/weapons/Test_weapon.json')).not.toContain('\n');
  });

  it('a rename deletes the old file instead of leaving a duplicate (F-44)', async () => {
    const w = store.bundle.weapons.Greatsword;
    if (!w) throw new Error('fixture');
    expect(store.saveItem({ ...w, name: 'Grand Sword' }, 'Greatsword')).toEqual({ ok: true });
    await store.flush();
    expect(ops()).toEqual(['put items/weapons/Grand_Sword.json', 'del items/weapons/Greatsword.json']);
    expect(Object.keys(store.bundle.weapons)).toContain('Grand Sword');
    expect(Object.keys(store.bundle.weapons)).not.toContain('Greatsword');
  });

  it('keeps unknown keys and the original key order on a round trip', async () => {
    const w = store.bundle.weapons.Greatsword;
    if (!w) throw new Error('fixture');
    store.saveItem(w, 'Greatsword');
    await store.flush();
    const original = readSave('items/weapons/Greatsword.json') as Record<string, unknown>;
    expect(Object.keys(json('items/weapons/Greatsword.json'))).toEqual(Object.keys(original));
  });

  it('refuses a name another item of the same kind already has', () => {
    expect(store.saveItem({ ...newItem('weapon'), name: 'Greatsword' }, null)).toMatchObject({
      ok: false,
      title: 'Duplicate Name',
    });
    expect(store.saveItem({ ...newItem('weapon'), name: '' }, null)).toMatchObject({
      ok: false,
      title: 'Missing Name',
    });
  });
});

describe('terrain', () => {
  it('create, rename (old file removed) and delete (file really removed, F-45)', async () => {
    expect(store.saveTerrain({ ...newTerrain(), type: 'Crate' }, null)).toEqual({ ok: true });
    expect(store.saveTerrain({ ...newTerrain(), type: 'Barrel' }, 'Crate')).toEqual({ ok: true });
    store.deleteTerrain('Rock');
    await store.flush();
    expect(ops()).toEqual([
      'put terrain/Crate.json',
      'put terrain/Barrel.json',
      'del terrain/Crate.json',
      'del terrain/Rock.json',
    ]);
    expect(store.bundle.terrain.map((t) => t.type)).toContain('Barrel');
    expect(store.bundle.terrain.map((t) => t.type)).not.toContain('Rock');
    expect(json('terrain/Barrel.json')).toMatchObject({ type: 'Barrel', health: 10, collision: true });
  });
});

describe('enemies', () => {
  it('files by sanitised name, deletes by the loaded file (F-46), renames cleanly', async () => {
    const unnamed = store.bundle.enemies.___;
    expect(unnamed?.name).toBe('???');
    store.deleteEnemy('___');
    expect(store.saveEnemy({ ...newEnemy(), name: 'Cave Bat' }, null)).toEqual({ ok: true });
    const bat = store.bundle.enemies['Cave Bat'];
    if (!bat) throw new Error('missing');
    expect(store.saveEnemy({ ...bat, name: 'Giant Cave Bat' }, 'Cave Bat')).toEqual({ ok: true });
    await store.flush();
    expect(ops()).toEqual([
      'del entities/enemies/___.json',
      'put entities/enemies/Cave Bat.json',
      'put entities/enemies/Giant Cave Bat.json',
      'del entities/enemies/Cave Bat.json',
    ]);
    expect(json('entities/enemies/Giant Cave Bat.json')).toMatchObject({
      name: 'Giant Cave Bat',
      baseName: 'Giant Cave Bat',
    });
    expect(store.bundle.enemies['Giant Cave Bat']?.fileStem).toBe('Giant Cave Bat');
    expect(store.saveEnemy({ ...newEnemy(), name: 'Spider' }, null)).toMatchObject({
      ok: false,
      title: 'Duplicate Name',
    });
  });

  it('custom tags go to enemy_tags.json, deduplicated', async () => {
    store.setEnemyTags(['Flying', ' Flying ', 'Aquatic', '']);
    await store.flush();
    expect(JSON.parse(io.files.get('enemy_tags.json') ?? '[]')).toEqual(['Flying', 'Aquatic']);
  });
});

describe('character sheets', () => {
  const fields = {
    name: 'Ivy Vale',
    color: '#336699',
    totalHP: 20,
    armorClass: 10,
    attributes: [5, 5, 5, 5, 4, 3] as [number, number, number, number, number, number],
    weapon: null,
    accessories: [null, null, null] as [null, null, null],
    group: 'ALPHA' as const,
  };

  it('creates a party sheet whose starting gear is equipped once, not also in the inventory (F-53)', async () => {
    const w = store.bundle.weapons.Greatsword ?? null;
    const sheet = newCharacter({ ...fields, weapon: w });
    expect(store.createSheet(sheet)).toEqual({ ok: true });
    await store.flush();
    const file = json('entities/party/Ivy_Vale.json');
    expect(file).toMatchObject({ name: 'Ivy Vale', isParty: true, currentHP: 20, group: 'ALPHA' });
    expect((file.weapons as { name: string }[])[0]?.name).toBe('Greatsword');
    expect(file.inventory).toEqual([]);
    // the file loads back to the same sheet
    expect(normalizeCharSheet(file).weapons[0]?.name).toBe('Greatsword');
    expect(store.createSheet(newCharacter(fields))).toMatchObject({ ok: false, title: 'Duplicate Name' });
  });

  it('renaming moves the file and the party.json entry (F-44)', async () => {
    const gwm = store.bundle.party['Grand Wizard Man'];
    if (!gwm) throw new Error('fixture');
    expect(store.saveSheet({ ...gwm, name: 'Grand Wizard Woman' }, 'Grand Wizard Man')).toEqual({ ok: true });
    await store.flush();
    expect(ops()).toEqual([
      'put entities/party/Grand_Wizard_Woman.json',
      'del entities/party/Grand_Wizard_Man.json',
      'put party.json',
    ]);
    expect(JSON.parse(io.files.get('party.json') ?? '[]')).toEqual(['Grand Wizard Woman']);
    expect(store.bundle.partyStems['Grand Wizard Woman']).toBe('Grand_Wizard_Woman');
    expect(changes).toContainEqual(expect.objectContaining({ kind: 'sheet', oldName: 'Grand Wizard Man' }));
  });

  it('deleting removes the file and its party.json entry', async () => {
    store.deleteSheet('Grand Wizard Man');
    await store.flush();
    expect(ops()).toEqual(['del entities/party/Grand_Wizard_Man.json', 'put party.json']);
    expect(store.bundle.partyList).toEqual([]);
  });

  it('adoptSheets takes battle changes in memory only', () => {
    const henry = store.bundle.party['Henry Keaton'];
    if (!henry) throw new Error('fixture');
    store.adoptSheets({ 'Henry Keaton': { ...henry, currentHP: 3 }, Stranger: henry });
    expect(store.bundle.party['Henry Keaton']?.currentHP).toBe(3);
    expect(store.bundle.party.Stranger).toBeUndefined();
    expect(store.writes).toEqual([]);
  });
});

describe('read-only mode (fixture scenarios)', () => {
  it('logs writes without touching the files, while the bundle still updates', async () => {
    store.readOnly = true;
    store.saveTerrain({ ...newTerrain(), type: 'Crate' }, null);
    await store.flush();
    expect(io.files.size).toBe(0);
    expect(store.writes).toEqual([
      expect.objectContaining({ op: 'put', path: 'terrain/Crate.json', skipped: true }),
    ]);
    expect(store.bundle.terrain.some((t) => t.type === 'Crate')).toBe(true);
  });
});

describe('write failures', () => {
  it('are reported and do not stop later writes', async () => {
    const failing = {
      calls: [] as string[],
      put(path: string) {
        this.calls.push(path);
        return path.includes('Bad') ? Promise.reject(new Error('disk full')) : Promise.resolve();
      },
      del() {
        return Promise.resolve();
      },
    };
    const raw = rawBundleFromDisk();
    const s = new AssetStore(normalizeBundle(raw), raw as RawFolders, failing);
    const errors: unknown[] = [];
    s.onError = (e) => errors.push(e);
    s.saveTerrain({ ...newTerrain(), type: 'Bad' }, null);
    s.saveTerrain({ ...newTerrain(), type: 'Good' }, null);
    await s.flush();
    expect(errors).toHaveLength(1);
    expect(failing.calls).toEqual(['terrain/Bad.json', 'terrain/Good.json']);
  });
});
