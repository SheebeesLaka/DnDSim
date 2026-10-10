/**
 * Build scenarios/test.json: a self-contained fixture (inline assets + battle
 * state) used by `?scenario=test`, the Playwright suite and the unit tests.
 * Run: npx tsx scripts/build-scenario.ts
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeBundle } from '../src/assets/bundle.ts';
import { createBattle } from '../src/engine/createBattle.ts';
import { reduceAll } from '../src/engine/reduce.ts';
import { seededRng } from '../src/engine/rng.ts';
import type { Command, EngineAssets } from '../src/engine/types.ts';

const SAVES = 'saves';
const folder = (rel: string): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  let names: string[] = [];
  try {
    names = readdirSync(join(SAVES, rel))
      .filter((n) => n.endsWith('.json'))
      .sort();
  } catch {
    return out;
  }
  for (const n of names)
    out[n.slice(0, -5)] = JSON.parse(readFileSync(join(SAVES, rel, n), 'utf8')) as unknown;
  return out;
};
const pick = (obj: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, obj[k]]));

const party = folder('entities/party');
const enemies = folder('entities/enemies');
const weapons = folder('items/weapons');

// Fixture-only tweaks (the real data files are never edited): give the shotgun its ammo type
// (FEATURES.md F-16) and hand Dan a box of shells so a ranged attack can be exercised.
const shotgun = { ...(weapons.Shortbarrel_Shotgun as Record<string, unknown>), ammoType: '12 Gauge' };
const dan = JSON.parse(JSON.stringify(party.Dan_Dixon)) as Record<string, unknown>;
(dan.weapons as unknown[])[0] = shotgun;
dan.inventory = [
  { ammoType: '12 Gauge', name: '12 Gauge Shells', type: 'Ammunition', color: 4, quantity: 6 },
  { healAmount: 25, name: 'First-Aid Kit', type: 'Consumable', color: '#8066CC', quantity: 2 },
];
dan.currentHP = 18;

const assets = {
  party: {
    ...pick(party, ['Henry_Keaton', 'Grand_Wizard_Man', 'NMB_15', 'Magnolia_Grandiflora']),
    Dan_Dixon: dan,
  },
  nonparty: {},
  enemies: pick(enemies, ['Spider', 'Snake', 'Overgrown Hornet', 'Human Puppet', 'Legendary Broodmother']),
  weapons: { ...weapons, Shortbarrel_Shotgun: shotgun },
  accessories: folder('items/accessories'),
  consumables: folder('items/consumables'),
  ammunition: folder('items/ammunition'),
  crafting: {},
  keyitems: {},
  spells: folder('spells'),
  terrain: folder('terrain'),
  gridshapes: {},
  partyList: ['Henry Keaton', 'Dan Dixon', 'Grand Wizard Man', 'NMB-15'],
  uiPrefs: {},
  enemyTags: [],
};

const bundle = normalizeBundle(assets);
if (bundle.problems.length) throw new Error(JSON.stringify(bundle.problems, null, 2));
const engineAssets: EngineAssets = {
  party: bundle.party,
  enemies: bundle.enemies,
  weapons: bundle.weapons,
  accessories: bundle.accessories,
  consumables: bundle.consumables,
  spells: bundle.spells,
  terrain: bundle.terrain,
};

let state = createBattle({ rows: 12, cols: 14, mask: null, theme: 'stone' }, engineAssets, {
  partyList: bundle.partyList,
});
const cmds: Command[] = [
  { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 6, c: 4 },
  { type: 'PLACE_ENTITY', name: 'Dan Dixon', r: 7, c: 3 },
  { type: 'PLACE_ENTITY', name: 'Grand Wizard Man', r: 2, c: 10 },
  { type: 'PLACE_ENTITY', name: 'NMB-15', r: 8, c: 4 },
  { type: 'PLACE_ENEMY', templateStem: 'Spider', r: 2, c: 12 },
  { type: 'PLACE_ENEMY', templateStem: 'Snake', r: 7, c: 7 },
  { type: 'PLACE_ENEMY', templateStem: 'Overgrown Hornet', r: 8, c: 9 },
  { type: 'PLACE_ENEMY', templateStem: 'Human Puppet', r: 9, c: 2 },
  { type: 'PLACE_TERRAIN', terrainType: 'Rock', r: 4, c: 3 },
  { type: 'PLACE_TERRAIN', terrainType: 'Rock', r: 4, c: 4 },
  { type: 'PLACE_TERRAIN', terrainType: 'Tree', r: 10, c: 11 },
  { type: 'PLACE_TERRAIN', terrainType: 'Acid', r: 6, c: 8 },
  { type: 'PLACE_PICKUP', itemKind: 'consumable', itemName: 'First-Aid Kit', r: 5, c: 5 },
  { type: 'PLACE_PICKUP', itemKind: 'weapon', itemName: 'Greatsword', r: 3, c: 6 },
];
for (let r = 5; r <= 10; r++) if (r !== 8) cmds.push({ type: 'PLACE_TERRAIN', terrainType: 'Rock', r, c: 6 });
for (let r = 1; r <= 3; r++)
  for (let c = 9; c <= 12; c++) cmds.push({ type: 'SET_ELEVATION', r, c, level: 2 });
for (let c = 9; c <= 12; c++) cmds.push({ type: 'SET_ELEVATION', r: 4, c, level: 1 });
for (let r = 1; r <= 4; r++) cmds.push({ type: 'SET_ELEVATION', r, c: 8, level: 1 });
cmds.push({ type: 'SET_ELEVATION', r: 1, c: 12, level: 3 });
for (let r = 8; r <= 9; r++)
  for (let c = 2; c <= 3; c++) cmds.push({ type: 'SET_ELEVATION', r, c, level: -1 });
cmds.push({ type: 'SET_ELEVATION', r: 9, c: 3, level: -2 });
cmds.push(
  { type: 'SET_RAMP', r: 5, c: 10, ramp: { r: 5, c: 10, from: 1, to: 0, dir: 'S' } },
  { type: 'SET_RAMP', r: 5, c: 11, ramp: { r: 5, c: 11, from: 1, to: 0, dir: 'S' } },
  { type: 'SET_ALTITUDE', unitId: 'u7', altitude: 3 },
  { type: 'SET_AMBIENT', level: 'dark' },
  {
    type: 'ADD_LIGHT',
    light: {
      id: 'lamp',
      name: 'Wall lamp',
      brightRadius: 3,
      dimRadius: 5,
      color: '#ffe3b0',
      at: { r: 1, c: 1 },
      on: true,
      groupId: 'corridor',
    },
  },
  {
    type: 'ADD_LIGHT',
    light: {
      id: 'torch',
      name: "Henry's torch",
      brightRadius: 2,
      dimRadius: 4,
      color: '#ffb366',
      attachedTo: 'u1',
      on: true,
    },
  },
  {
    type: 'ADD_LIGHT',
    light: {
      id: 'hangar',
      name: 'Hangar ceiling',
      brightRadius: 4,
      dimRadius: 6,
      color: '#bfe3ff',
      at: { r: 9, c: 10 },
      on: true,
      groupId: 'hangar',
    },
  },
  { type: 'SET_LIGHT_GROUP', group: { id: 'corridor', name: 'Corridor', on: true } },
  { type: 'SET_LIGHT_GROUP', group: { id: 'hangar', name: 'Hangar (generator)', on: false } },
);
const res = reduceAll(state, cmds, { rng: seededRng(1), assets: engineAssets });
if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
state = res.state;

mkdirSync('scenarios', { recursive: true });
const scenario = {
  name: 'test',
  description:
    'Shared test scene: platform with ledge and ramp, pit, bulkhead wall, flying hornet, lamp + torch, dark hangar group.',
  assets,
  battle: state,
};
writeFileSync('scenarios/test.json', JSON.stringify(scenario, null, 2) + '\n');
console.log(`wrote scenarios/test.json (${state.units.length} units, ${state.board.lights.length} lights)`);
