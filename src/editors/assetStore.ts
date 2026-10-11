/**
 * The editors' single source of truth: an immutable AssetBundle plus every
 * write the editors make to saves/. Records are written in the Java file
 * formats (same writers, same key order as the file they came from), so the
 * legacy app keeps reading them. IO is injected, so all of this is unit-tested.
 *
 * Java behaviours deliberately fixed here (FEATURES.md §17.3):
 *  - F-44 renaming a character, item, enemy or terrain deletes the old file (and
 *    updates party.json for characters) instead of leaving a duplicate;
 *  - F-45 deleting terrain deletes its file;
 *  - F-46 enemies are deleted by the file they were loaded from;
 *  - F-47 crafting items are written as "Crafting Item".
 * Two names that would map to the same file are refused rather than silently
 * overwriting each other.
 */
import { SAVE_PATHS, enemyStem, javaStem } from '../assets/filenames.ts';
import type { AssetBundle, CharSheetDef, EnemyDef, SpellDef, TerrainDef } from '../assets/types.ts';
import {
  charSheetToJson,
  enemyToJson,
  itemToJson,
  spellToJson,
  stringifyLike,
  terrainToJson,
  type PRETTY,
} from '../assets/write.ts';
import { ITEM_TYPE_STRING, type AssetItemDef, type AssetItemKind } from './defaults.ts';

export interface AssetIO {
  put(path: string, text: string): Promise<void>;
  del(path: string): Promise<void>;
}

export type SaveResult = { ok: true } | { ok: false; title: string; message: string };

export type AssetChange =
  | { kind: 'sheet'; oldName: string | null; sheet: CharSheetDef | null }
  | { kind: 'spell' | 'item' | 'terrain' | 'enemy' | 'partyList' | 'enemyTags' };

export interface WriteRecord {
  op: 'put' | 'del';
  path: string;
  text?: string;
  /** true when the store is read-only (fixture scenarios): logged, not written */
  skipped: boolean;
}

/** /api/assets payload folders → raw JSON by file stem (key-order templates). */
export type RawFolders = Record<string, Record<string, unknown>>;

const ITEM_FOLDER: Record<
  AssetItemKind,
  'weapons' | 'accessories' | 'consumables' | 'ammunition' | 'crafting' | 'keyitems'
> = {
  weapon: 'weapons',
  accessory: 'accessories',
  consumable: 'consumables',
  ammunition: 'ammunition',
  crafting: 'crafting',
  keyitem: 'keyitems',
};

const fail = (title: string, message: string): SaveResult => ({ ok: false, title, message });
const OK: SaveResult = { ok: true };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** saves/-relative path → [raw folder, stem] for template lookup. */
function templateKey(path: string): [string, string] | null {
  const m =
    /^(?:entities\/)?(party|enemies|nonparty|spells|terrain|gridshapes|items\/(\w+))\/(.+)\.json$/.exec(path);
  if (!m) return null;
  const folder = m[2] ?? m[1] ?? '';
  return [folder, m[3] ?? ''];
}

export class AssetStore {
  private current: AssetBundle;
  private raw: RawFolders;
  private listeners = new Set<(change: AssetChange) => void>();
  private queue: Promise<void> = Promise.resolve();
  /** every write in order (tests, debug panel, e2e in read-only mode) */
  readonly writes: WriteRecord[] = [];
  readOnly: boolean;
  onError: (err: unknown) => void = (err) => console.warn('asset write failed', err);

  constructor(
    bundle: AssetBundle,
    raw: RawFolders,
    private readonly io: AssetIO,
    opts: { readOnly?: boolean } = {},
  ) {
    this.current = bundle;
    this.raw = clone(raw);
    this.readOnly = opts.readOnly ?? false;
  }

  get bundle(): AssetBundle {
    return this.current;
  }

  subscribe(fn: (change: AssetChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Resolves once every queued write has been attempted. */
  flush(): Promise<void> {
    return this.queue;
  }

  // ---------------------------------------------------------------- spells

  /** SpellDatabase.renameSpell: save under the (new) name; a rename drops the old file and
   *  rewrites the name in every party sheet that knows the spell. */
  saveSpell(spell: SpellDef, originalName: string | null): SaveResult {
    const name = spell.name.trim();
    if (!name) return fail('Missing Name', 'Give the spell a name.');
    const clash = this.current.spells[name];
    if (clash && name !== originalName)
      return fail('Duplicate Name', `A spell named ${name} already exists.`);
    const stemClash = this.stemClash(Object.keys(this.current.spells), name, originalName);
    if (stemClash) return fail('Duplicate Name', `${name} would overwrite the file of ${stemClash}.`);
    const next: SpellDef = { ...clone(spell), name };
    const spells = { ...this.current.spells };
    if (originalName !== null && originalName !== name) delete spells[originalName];
    spells[name] = next;
    this.current = { ...this.current, spells };
    this.put(SAVE_PATHS.spell(name), 'spell', spellToJson(next));
    if (originalName !== null && originalName !== name) {
      this.delIfDifferent(SAVE_PATHS.spell(originalName), SAVE_PATHS.spell(name));
      for (const sheet of Object.values(this.current.party)) {
        if (!sheet.knownSpells.includes(originalName)) continue;
        const updated = {
          ...clone(sheet),
          knownSpells: sheet.knownSpells.map((s) => (s === originalName ? name : s)),
        };
        this.writeSheet(updated, sheet.name);
      }
    }
    this.emit({ kind: 'spell' });
    return OK;
  }

  /** Characters who know a deleted spell keep its name and simply stop seeing it (Java). */
  deleteSpell(name: string): void {
    if (!(name in this.current.spells)) return;
    const spells = { ...this.current.spells };
    delete spells[name];
    this.current = { ...this.current, spells };
    this.del(SAVE_PATHS.spell(name));
    this.emit({ kind: 'spell' });
  }

  // ----------------------------------------------------------------- items

  itemsOf(kind: AssetItemKind): Record<string, AssetItemDef> {
    return this.current[ITEM_FOLDER[kind]];
  }

  saveItem(item: AssetItemDef, originalName: string | null): SaveResult {
    const name = item.name.trim();
    if (!name) return fail('Missing Name', 'Give the item a name.');
    const kind = item.kind;
    const folder = ITEM_FOLDER[kind];
    const existing = this.itemsOf(kind);
    if (existing[name] && name !== originalName)
      return fail('Duplicate Name', `An item named ${name} already exists.`);
    const stemClash = this.stemClash(Object.keys(existing), name, originalName);
    if (stemClash) return fail('Duplicate Name', `${name} would overwrite the file of ${stemClash}.`);
    const next = { ...clone(item), name, type: ITEM_TYPE_STRING[kind] };
    const records = { ...existing } as Record<string, AssetItemDef>;
    if (originalName !== null && originalName !== name) delete records[originalName];
    records[name] = next;
    this.current = { ...this.current, [folder]: records };
    const path = SAVE_PATHS[kind](name);
    this.put(path, kind, itemToJson(next));
    if (originalName !== null && originalName !== name)
      this.delIfDifferent(SAVE_PATHS[kind](originalName), path);
    this.emit({ kind: 'item' });
    return OK;
  }

  deleteItem(kind: AssetItemKind, name: string): void {
    const existing = this.itemsOf(kind);
    if (!(name in existing)) return;
    const records = { ...existing };
    delete records[name];
    this.current = { ...this.current, [ITEM_FOLDER[kind]]: records };
    this.del(SAVE_PATHS[kind](name));
    this.emit({ kind: 'item' });
  }

  // --------------------------------------------------------------- terrain

  saveTerrain(terrain: TerrainDef, originalType: string | null): SaveResult {
    const type = terrain.type.trim();
    if (!type) return fail('Missing Name', 'Give the terrain a type name.');
    const types = this.current.terrain.map((t) => t.type);
    if (types.includes(type) && type !== originalType)
      return fail('Duplicate Name', `Terrain named ${type} already exists.`);
    const stemClash = this.stemClash(types, type, originalType);
    if (stemClash) return fail('Duplicate Name', `${type} would overwrite the file of ${stemClash}.`);
    const next: TerrainDef = { ...clone(terrain), type };
    const list = [...this.current.terrain];
    const at = originalType === null ? -1 : list.findIndex((t) => t.type === originalType);
    if (at >= 0) list[at] = next;
    else list.push(next);
    this.current = { ...this.current, terrain: list };
    const path = SAVE_PATHS.terrain(type);
    this.put(path, 'terrain', terrainToJson(next));
    if (originalType !== null && originalType !== type)
      this.delIfDifferent(SAVE_PATHS.terrain(originalType), path);
    this.emit({ kind: 'terrain' });
    return OK;
  }

  deleteTerrain(type: string): void {
    if (!this.current.terrain.some((t) => t.type === type)) return;
    this.current = { ...this.current, terrain: this.current.terrain.filter((t) => t.type !== type) };
    this.del(SAVE_PATHS.terrain(type));
    this.emit({ kind: 'terrain' });
  }

  // --------------------------------------------------------------- enemies

  /** Enemy templates are keyed (and filed) by the sanitised name. */
  saveEnemy(enemy: EnemyDef, originalStem: string | null): SaveResult {
    const name = enemy.name.trim();
    if (!name) return fail('Missing Name', 'Give the enemy a name.');
    const stem = enemyStem(name);
    const other = this.current.enemies[stem];
    if (other && stem !== originalStem)
      return fail('Duplicate Name', `${name} would overwrite the enemy ${other.name}.`);
    const next: EnemyDef = { ...clone(enemy), name, baseName: name, fileStem: stem };
    const enemies = { ...this.current.enemies };
    if (originalStem !== null && originalStem !== stem) delete enemies[originalStem];
    enemies[stem] = next;
    this.current = { ...this.current, enemies };
    const path = `entities/enemies/${stem}.json`;
    this.put(path, 'enemy', enemyToJson(next));
    if (originalStem !== null && originalStem !== stem)
      this.delIfDifferent(`entities/enemies/${originalStem}.json`, path);
    this.emit({ kind: 'enemy' });
    return OK;
  }

  deleteEnemy(stem: string): void {
    if (!(stem in this.current.enemies)) return;
    const enemies = { ...this.current.enemies };
    delete enemies[stem];
    this.current = { ...this.current, enemies };
    this.del(`entities/enemies/${stem}.json`);
    this.emit({ kind: 'enemy' });
  }

  /** enemy_tags.json: custom tags beyond Enemy.PREDEFINED_TAGS. */
  setEnemyTags(tags: string[]): void {
    const unique = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
    this.current = { ...this.current, enemyTags: unique };
    this.put(SAVE_PATHS.enemyTags(), 'enemyTags', unique);
    this.emit({ kind: 'enemyTags' });
  }

  // ---------------------------------------------------------------- sheets

  /** Create a new party sheet. */
  createSheet(sheet: CharSheetDef): SaveResult {
    const check = this.checkSheetName(sheet.name, null);
    if (!check.ok) return check;
    this.writeSheet({ ...clone(sheet), name: sheet.name.trim() }, null);
    return OK;
  }

  /**
   * Save an edited sheet (Java saves on every setter; the UI debounces). A rename
   * deletes the old file and renames the party.json entry.
   */
  saveSheet(sheet: CharSheetDef, originalName: string): SaveResult {
    const check = this.checkSheetName(sheet.name, originalName);
    if (!check.ok) return check;
    this.writeSheet({ ...clone(sheet), name: sheet.name.trim() }, originalName);
    return OK;
  }

  deleteSheet(name: string): void {
    if (!(name in this.current.party)) return;
    const party = { ...this.current.party };
    const stems = { ...this.current.partyStems };
    const path = `entities/party/${stems[name] ?? javaStem(name)}.json`;
    delete party[name];
    delete stems[name];
    this.current = { ...this.current, party, partyStems: stems };
    this.del(path);
    if (this.current.partyList.includes(name))
      this.setPartyList(this.current.partyList.filter((n) => n !== name));
    this.emit({ kind: 'sheet', oldName: name, sheet: null });
  }

  /** party.json (PartyConfig): the active party, in placement order. */
  setPartyList(names: string[]): void {
    const list = names.filter((n, i) => names.indexOf(n) === i);
    this.current = { ...this.current, partyList: list };
    this.put(SAVE_PATHS.partyList(), 'partyList', list);
    this.emit({ kind: 'partyList' });
  }

  /**
   * Take sheets a battle has changed (HP, statuses, slots) without writing them:
   * the battle's own persister already did. Used when Character Sheets opens
   * over a running battle or after one ends.
   */
  adoptSheets(sheets: Record<string, CharSheetDef>): void {
    let changed = false;
    const party = { ...this.current.party };
    for (const [name, sheet] of Object.entries(sheets)) {
      if (!(name in party)) continue;
      party[name] = clone(sheet);
      changed = true;
    }
    if (changed) this.current = { ...this.current, party };
  }

  // -------------------------------------------------------------- internals

  private checkSheetName(rawName: string, originalName: string | null): SaveResult {
    const name = rawName.trim();
    if (!name) return fail('Missing Name', 'Give the character a name.');
    if (name in this.current.party && name !== originalName)
      return fail('Duplicate Name', `A character named ${name} already exists.`);
    const stemClash = this.stemClash(Object.keys(this.current.party), name, originalName);
    if (stemClash) return fail('Duplicate Name', `${name} would overwrite the file of ${stemClash}.`);
    return OK;
  }

  private writeSheet(sheet: CharSheetDef, originalName: string | null): void {
    const party = { ...this.current.party };
    const stems = { ...this.current.partyStems };
    const oldPath =
      originalName !== null ? `entities/party/${stems[originalName] ?? javaStem(originalName)}.json` : null;
    if (originalName !== null && originalName !== sheet.name) {
      delete party[originalName];
      delete stems[originalName];
    }
    party[sheet.name] = sheet;
    stems[sheet.name] = javaStem(sheet.name);
    this.current = { ...this.current, party, partyStems: stems };
    const path = SAVE_PATHS.party(sheet.name);
    this.put(path, 'party', charSheetToJson(sheet), oldPath ?? undefined);
    if (oldPath !== null) this.delIfDifferent(oldPath, path);
    if (originalName !== null && originalName !== sheet.name && this.current.partyList.includes(originalName))
      this.setPartyList(this.current.partyList.map((n) => (n === originalName ? sheet.name : n)));
    this.emit({ kind: 'sheet', oldName: originalName, sheet });
  }

  /** Another record (not the one being renamed) whose file stem equals `name`'s. */
  private stemClash(names: string[], name: string, originalName: string | null): string | null {
    const stem = javaStem(name);
    return names.find((n) => n !== name && n !== originalName && javaStem(n) === stem) ?? null;
  }

  private put(path: string, kind: keyof typeof PRETTY, json: unknown, templatePath?: string): void {
    const key = templateKey(templatePath ?? path);
    const template = key ? this.raw[key[0]]?.[key[1]] : undefined;
    const text = stringifyLike(kind, json, template);
    const own = templateKey(path);
    if (own) {
      this.raw[own[0]] ??= {};
      (this.raw[own[0]] as Record<string, unknown>)[own[1]] = JSON.parse(text) as unknown;
    }
    this.enqueue({ op: 'put', path, text, skipped: this.readOnly }, () => this.io.put(path, text));
  }

  private del(path: string): void {
    const key = templateKey(path);
    if (key) delete this.raw[key[0]]?.[key[1]];
    this.enqueue({ op: 'del', path, skipped: this.readOnly }, () => this.io.del(path));
  }

  private delIfDifferent(oldPath: string, newPath: string): void {
    if (oldPath !== newPath) this.del(oldPath);
  }

  private enqueue(record: WriteRecord, run: () => Promise<void>): void {
    this.writes.push(record);
    if (record.skipped) return;
    this.queue = this.queue.then(run).catch((err: unknown) => this.onError(err));
  }

  private emit(change: AssetChange): void {
    for (const l of this.listeners) l(change);
  }
}
