/** Setups shared by the combat/spell suites. */
import { seededRng } from '../../src/engine/rng.ts';
import type {
  BattleState,
  Command,
  EngineAssets,
  EngineContext,
  EntityUnit,
  EnemyUnit,
} from '../../src/engine/types.ts';
import { ctx, engineAssets, fresh, run, step } from './engine.ts';

/** Real assets, but the shotgun gets its ammo type and Dan a box of shells (fixture-only; data files untouched). */
export function combatAssets(): EngineAssets {
  const base = engineAssets();
  const assets: EngineAssets = JSON.parse(JSON.stringify(base)) as EngineAssets;
  const shotgun = assets.weapons['Shortbarrel Shotgun']!;
  shotgun.ammoType = '12 Gauge';
  const dan = assets.party['Dan Dixon']!;
  dan.weapons[0] = JSON.parse(JSON.stringify(shotgun)) as typeof shotgun;
  dan.inventory = [
    {
      kind: 'ammunition',
      name: '12 Gauge Shells',
      type: 'Ammunition',
      color: '#FF0000',
      quantity: 2,
      ammoType: '12 Gauge',
      legacyCompatibleWeaponType: null,
      legacyDamageBonus: 0,
      extra: {},
    },
    {
      kind: 'consumable',
      name: 'First-Aid Kit',
      type: 'Consumable',
      color: '#8066CC',
      quantity: 2,
      healAmount: 25,
      effect: null,
      extra: {},
    },
  ];
  return assets;
}

export function started(
  seed = 1,
  extra: Command[] = [],
  compat: Partial<BattleState['rules']['compat']> = {},
  assets = combatAssets(),
) {
  const c: EngineContext = { rng: seededRng(seed), assets };
  let state = fresh({ partyList: [], compat }, undefined, c).state;
  state = run(
    state,
    c,
    { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 }, // u1: 20/36, AC 14, STR 6, unarmed (sledgehammer in slot 2)
    { type: 'PLACE_ENTITY', name: 'Dan Dixon', r: 0, c: 1 }, // u2: shotgun d6/d4/d8 DEX 5, 2 shells
    { type: 'PLACE_ENTITY', name: 'Grand Wizard Man', r: 0, c: 2 }, // u3: caster INT 11, level 12
    { type: 'PLACE_ENEMY', templateStem: 'Spider', r: 3, c: 3 }, // u4: 18 HP, AC 12, DEX 4
    { type: 'PLACE_ENEMY', templateStem: 'Snake', r: 4, c: 4 }, // u5: 14 HP, AC 12, DEX 7, saves 7
    { type: 'PLACE_TERRAIN', terrainType: 'Tree', r: 6, c: 6 }, // u6: 5 HP
    ...extra,
    { type: 'BEGIN_BATTLE' },
    { type: 'SUBMIT_INITIATIVE', rolls: { u1: 10, u2: 9, u3: 8 } },
  );
  return { state, c };
}

export const entity = (s: BattleState, id: string) => s.units.find((u) => u.id === id) as EntityUnit;
export const enemy = (s: BattleState, id: string) => s.units.find((u) => u.id === id) as EnemyUnit;
export { ctx, run, step };
