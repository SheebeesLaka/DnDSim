import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const ROOT = process.cwd();
export const SAVES = join(ROOT, 'saves');

/** Every *.json under saves/, as [posix relative path, parsed JSON]. */
export function allSaveFiles(): { rel: string; raw: unknown; text: string }[] {
  const out: { rel: string; raw: unknown; text: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.json')) {
        const text = readFileSync(p, 'utf8');
        out.push({ rel: relative(SAVES, p).split(sep).join('/'), raw: JSON.parse(text) as unknown, text });
      }
    }
  };
  walk(SAVES);
  return out;
}

export function readFolder(rel: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of allSaveFiles()) {
    const dir = f.rel.slice(0, f.rel.lastIndexOf('/'));
    if (dir === rel) out[f.rel.slice(dir.length + 1, -'.json'.length)] = f.raw;
  }
  return out;
}

export function readSave(rel: string): unknown {
  return JSON.parse(readFileSync(join(SAVES, rel), 'utf8')) as unknown;
}

/** The same payload GET /api/assets returns, built straight from disk. */
export function rawBundleFromDisk(): Record<string, unknown> {
  const single = (rel: string, dflt: unknown) => {
    try {
      return readSave(rel);
    } catch {
      return dflt;
    }
  };
  return {
    party: readFolder('entities/party'),
    nonparty: readFolder('entities/nonparty'),
    enemies: readFolder('entities/enemies'),
    weapons: readFolder('items/weapons'),
    accessories: readFolder('items/accessories'),
    consumables: readFolder('items/consumables'),
    ammunition: readFolder('items/ammunition'),
    crafting: readFolder('items/crafting'),
    keyitems: readFolder('items/keyitems'),
    spells: readFolder('spells'),
    terrain: readFolder('terrain'),
    gridshapes: readFolder('gridshapes'),
    partyList: single('party.json', []),
    uiPrefs: single('ui_prefs.json', {}),
    enemyTags: single('enemy_tags.json', []),
  };
}
