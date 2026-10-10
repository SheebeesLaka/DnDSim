/** Test helpers: a seeded engine context over the real saves/ assets, plus a command runner. */
import { normalizeBundle } from '../../src/assets/bundle.ts';
import type { AssetBundle } from '../../src/assets/types.ts';
import { createBattle, type CreateBattleOptions } from '../../src/engine/createBattle.ts';
import { reduce, reduceAll } from '../../src/engine/reduce.ts';
import { seededRng } from '../../src/engine/rng.ts';
import type { BattleState, Command, EngineAssets, EngineContext, GridSetup } from '../../src/engine/types.ts';
import { rawBundleFromDisk } from './saves.ts';

let cached: AssetBundle | null = null;
export function bundle(): AssetBundle {
  cached ??= normalizeBundle(rawBundleFromDisk());
  return cached;
}

export function engineAssets(b: AssetBundle = bundle()): EngineAssets {
  return {
    party: b.party,
    enemies: b.enemies,
    weapons: b.weapons,
    accessories: b.accessories,
    consumables: b.consumables,
    spells: b.spells,
    terrain: b.terrain,
  };
}

export function ctx(seed = 1, assets: EngineAssets = engineAssets()): EngineContext {
  return { rng: seededRng(seed), assets };
}

export const grid = (rows = 8, cols = 8, mask: boolean[][] | null = null, theme = 'stone'): GridSetup => ({
  rows,
  cols,
  mask,
  theme,
});

export function fresh(
  opts: CreateBattleOptions = {},
  setup = grid(),
  c: EngineContext = ctx(),
): { state: BattleState; ctx: EngineContext } {
  return { state: createBattle(setup, c.assets, opts), ctx: c };
}

/** Apply commands, throwing on the first error (for setup steps that must succeed). */
export function run(state: BattleState, c: EngineContext, ...commands: Command[]): BattleState {
  const res = reduceAll(state, commands, c);
  if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
  return res.state;
}

/** Apply one command and return the full result (for asserting errors/events). */
export const step = (state: BattleState, c: EngineContext, command: Command) => reduce(state, command, c);

export function unitNamed(state: BattleState, name: string) {
  const u = state.units.find((u) =>
    u.kind === 'entity'
      ? u.sheet.name === name
      : u.kind === 'enemy'
        ? `${u.baseName} #${u.instanceNumber}` === name || u.name === name
        : u.kind === 'terrain'
          ? u.type === name
          : u.item.name === name,
  );
  if (!u) throw new Error(`no unit named ${name}`);
  return u;
}
