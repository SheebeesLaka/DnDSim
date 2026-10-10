/**
 * Golden tests over the committed saves/ folder: every file loads through the
 * normalisers, the normalised shape is snapshotted, and writing it back is
 * structurally identical to the original (same keys, same key order, same
 * values apart from the documented normalisations). FEATURES.md §15.
 */
import { describe, expect, it } from 'vitest';
import { normalizeBundle } from '../../src/assets/bundle.ts';
import {
  normalizeCharSheet,
  normalizeEnemy,
  normalizeGridShapePreset,
  normalizeSpell,
  normalizeTerrain,
  normalizeWeapon,
  normalizeAccessory,
  normalizeConsumable,
  normalizeAmmunition,
  normalizeCraftingItem,
  normalizeKeyItem,
} from '../../src/assets/normalize.ts';
import {
  accessoryToJson,
  ammunitionToJson,
  charSheetToJson,
  consumableToJson,
  craftingItemToJson,
  enemyToJson,
  gridShapePresetToJson,
  keyItemToJson,
  spellToJson,
  stringifyLike,
  terrainToJson,
  weaponToJson,
} from '../../src/assets/write.ts';
import { normalizeHex } from '../../src/assets/color.ts';
import { allSaveFiles, rawBundleFromDisk } from '../helpers/saves.ts';

type Json = Record<string, unknown>;

/** Which normaliser/writer pair a saves/ path uses, keyed by folder. */
function pairFor(
  rel: string,
): { kind: string; load: (raw: unknown, stem: string) => unknown; write: (def: never) => Json } | null {
  const folder = rel.slice(0, rel.lastIndexOf('/'));
  switch (folder) {
    case 'entities/party':
    case 'entities/nonparty':
      return {
        kind: folder === 'entities/party' ? 'party' : 'nonparty',
        load: normalizeCharSheet,
        write: charSheetToJson,
      };
    case 'entities/enemies':
      return { kind: 'enemy', load: normalizeEnemy, write: enemyToJson };
    case 'items/weapons':
      return { kind: 'weapon', load: normalizeWeapon, write: weaponToJson };
    case 'items/accessories':
      return { kind: 'accessory', load: normalizeAccessory, write: accessoryToJson };
    case 'items/consumables':
      return { kind: 'consumable', load: normalizeConsumable, write: consumableToJson };
    case 'items/ammunition':
      return { kind: 'ammunition', load: normalizeAmmunition, write: ammunitionToJson };
    case 'items/crafting':
      return { kind: 'crafting', load: normalizeCraftingItem, write: craftingItemToJson };
    case 'items/keyitems':
      return { kind: 'keyitem', load: normalizeKeyItem, write: keyItemToJson };
    case 'spells':
      return { kind: 'spell', load: normalizeSpell, write: spellToJson };
    case 'terrain':
      return { kind: 'terrain', load: normalizeTerrain, write: terrainToJson };
    case 'gridshapes':
      return { kind: 'gridshape', load: normalizeGridShapePreset, write: gridShapePresetToJson };
    default:
      return null; // party.json, ui_prefs.json handled by the bundle test
  }
}

/** Keys (recursive, dotted) whose value the port is allowed to rewrite on load. */
function isAllowedDifference(path: string, before: unknown, after: unknown): boolean {
  const leaf = path.split('.').pop() ?? '';
  // colours are normalised to #RRGGBB (legacy ints / "9" / lower-case hex)
  if (leaf === 'color') return normalizeHex(before) === after;
  // Java pads attribute arrays to 6 on load (Plasmoid_Core has 5)
  if (
    leaf === 'modifiedAttributes' ||
    leaf === 'baseAttributes' ||
    leaf === 'tempAttributes' ||
    leaf === 'totalAttributes'
  ) {
    return (
      Array.isArray(before) &&
      Array.isArray(after) &&
      after.length === 6 &&
      before.every((v, i) => after[i] === v)
    );
  }
  return false;
}

function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => keyPaths(v, `${prefix}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.keys(value).flatMap((k) => [
      prefix ? `${prefix}.${k}` : k,
      ...keyPaths((value as Json)[k], prefix ? `${prefix}.${k}` : k),
    ]);
  }
  return [];
}

function getPath(value: unknown, path: string): unknown {
  let cur: unknown = value;
  for (const part of path.replace(/\[(\d+)\]/g, '.$1').split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Json)[part];
  }
  return cur;
}

const files = allSaveFiles();
const typed = files.map((f) => ({ ...f, pair: pairFor(f.rel) })).filter((f) => f.pair !== null);

describe('golden: every saves/ file', () => {
  it('finds the expected inventory of files', () => {
    expect(files.length).toBeGreaterThanOrEqual(63);
    expect(files.filter((f) => f.rel.startsWith('entities/enemies/'))).toHaveLength(18);
    expect(files.filter((f) => f.rel.startsWith('spells/'))).toHaveLength(16);
  });

  it.each(typed.map((f) => [f.rel, f] as const))('%s loads and snapshots', (rel, f) => {
    const stem = rel.slice(rel.lastIndexOf('/') + 1, -'.json'.length);
    const def = f.pair?.load(f.raw, stem);
    expect(def).toMatchSnapshot();
  });

  it.each(typed.map((f) => [f.rel, f] as const))('%s round-trips structurally', (rel, f) => {
    const stem = rel.slice(rel.lastIndexOf('/') + 1, -'.json'.length);
    const pair = f.pair;
    if (!pair) return;
    const def = pair.load(f.raw, stem);
    const text = stringifyLike(pair.kind, pair.write(def as never), f.raw);
    const back = JSON.parse(text) as unknown;

    // every original key survives, in the original order
    const beforeKeys = keyPaths(f.raw);
    const afterKeys = keyPaths(back);
    for (const k of beforeKeys) expect(afterKeys, `${rel}: missing key ${k}`).toContain(k);
    const afterFiltered = afterKeys.filter((k) => beforeKeys.includes(k));
    expect(afterFiltered).toEqual(beforeKeys);

    // every original leaf value survives, except the documented normalisations
    for (const k of beforeKeys) {
      const before = getPath(f.raw, k);
      const after = getPath(back, k);
      if (before && typeof before === 'object') continue;
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        expect(
          isAllowedDifference(k, before, after),
          `${rel}: ${k} changed ${JSON.stringify(before)} → ${JSON.stringify(after)}`,
        ).toBe(true);
      }
    }

    // idempotence: re-loading the written text gives the same normalised record
    expect(pair.load(back, stem)).toEqual(def);
    // pretty vs compact follows the Java writer for that type
    const pretty = text.includes('\n');
    expect(pretty).toBe(['enemy', 'spell'].includes(pair.kind));
  });

  it('the whole bundle normalises with no problems', () => {
    const bundle = normalizeBundle(rawBundleFromDisk());
    expect(bundle.problems).toEqual([]);
    expect(Object.keys(bundle.enemies).sort()).toEqual([
      'Dr. Petra Ilyas',
      'Dummy',
      'Elder Falsiradix',
      'Elder Falsiradix Tendril',
      'Falsiradix',
      'Grey Ooze',
      'Human Puppet',
      'Legendary Broodmother',
      'Legendary Elder Falsiradix',
      'Melee Moongate Guard',
      'Overgrown Hornet',
      'Receptionist',
      'Rug of Smothering',
      'Shielded Moongate Guard',
      'Snake',
      'Spider',
      'Spliced Hound',
      '___',
    ]);
    expect(bundle.enemies.___?.name).toBe('???');
    expect(bundle.enemies.___?.fileStem).toBe('___');
    expect(Object.keys(bundle.party)).toHaveLength(12);
    expect(bundle.partyStems['Henry Keaton']).toBe('Henry_Keaton');
    expect(Object.keys(bundle.weapons)).toHaveLength(7);
    expect(Object.keys(bundle.spells)).toHaveLength(16);
    expect(bundle.terrain.map((t) => t.type)).toEqual(['Acid', 'Red Flower', 'Rock', 'Tree']);
    expect(bundle.partyList).toEqual(['Grand Wizard Man']);
    expect(bundle.uiPrefs['display.player.enemyHp']).toBe('EXACT');
    expect(bundle.uiPrefs['display.player.spellTemplates']).toBe('true');
    expect(bundle).toMatchSnapshot();
  });
});
