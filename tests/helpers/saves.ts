import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const ROOT = process.cwd();
/** Authored content (tracked). */
export const SAVES = join(ROOT, 'saves');
/**
 * The tracked starting campaign. Tests read character sheets, the party list
 * and prefs from here, never from the live campaign/ folder, so a game
 * session (HP going up and down) can't change test results.
 */
export const CAMPAIGN_SEED = join(ROOT, 'campaign.example');

/** Where a saves-relative path lives for tests: the campaign seed or saves/. */
const baseFor = (rel: string): string =>
  /^(entities\/(party|nonparty)(\/|$)|party\.json$|ui_prefs\.json$)/.test(rel) ? CAMPAIGN_SEED : SAVES;

/** Every *.json under saves/ and the campaign seed, as saves-relative posix paths (sorted). */
export function allSaveFiles(): { rel: string; raw: unknown; text: string }[] {
  const out: { rel: string; raw: unknown; text: string }[] = [];
  const walk = (root: string, dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(root, p);
      else if (name.endsWith('.json')) {
        const text = readFileSync(p, 'utf8');
        out.push({ rel: relative(root, p).split(sep).join('/'), raw: JSON.parse(text) as unknown, text });
      }
    }
  };
  walk(SAVES, SAVES);
  walk(CAMPAIGN_SEED, CAMPAIGN_SEED);
  return out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
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
  return JSON.parse(readFileSync(join(baseFor(rel), rel), 'utf8')) as unknown;
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
