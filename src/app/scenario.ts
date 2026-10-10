/** `?scenario=<name>&seed=<n>` loading and the engine context for the browser. */
import { normalizeBundle } from '../assets/bundle.ts';
import type { AssetBundle } from '../assets/types.ts';
import { seededRng, type Rng } from '../engine/rng.ts';
import { parseBattle } from '../engine/serialize.ts';
import type { BattleState, EngineAssets } from '../engine/types.ts';

export interface Scenario {
  name: string;
  description?: string;
  assets?: unknown;
  battle: unknown;
}

export function engineAssetsOf(b: AssetBundle): EngineAssets {
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

/** Browser-grade randomness through the engine's Rng interface. */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(1);
  const next = (): number => {
    crypto.getRandomValues(buf);
    return (buf[0] as number) / 4294967296;
  };
  return { float: next, int: (min, max) => min + Math.floor(next() * (max - min + 1)) };
}

export function rngFromParams(params: URLSearchParams): Rng {
  const seed = params.get('seed');
  return seed !== null && seed !== '' && Number.isFinite(Number(seed))
    ? seededRng(Number(seed))
    : cryptoRng();
}

/** A scenario's inline assets replace the server's; its battle state is parsed and validated. */
export function applyScenario(
  scenario: Scenario,
  serverBundle: AssetBundle,
): { bundle: AssetBundle; battle: BattleState } {
  const bundle = scenario.assets ? normalizeBundle(scenario.assets) : serverBundle;
  return { bundle, battle: parseBattle(scenario.battle) };
}
