import { LEGACY_COMPAT, type CompatFlags } from './compat.ts';
import { BATTLE_STATE_VERSION, type BattleState, type EngineAssets, type GridSetup } from './types.ts';

export interface CreateBattleOptions {
  compat?: Partial<CompatFlags>;
  /** Party names to place one at a time (PartyConfig order); names without a sheet are skipped. */
  partyList?: string[];
}

/** AppController.navigateToBattle + BattleView.startPlacementPhase: a fresh, empty board. */
export function createBattle(
  setup: GridSetup,
  assets: EngineAssets,
  opts: CreateBattleOptions = {},
): BattleState {
  const rows = Math.max(1, Math.trunc(setup.rows));
  const cols = Math.max(1, Math.trunc(setup.cols));
  const queue = (opts.partyList ?? []).filter((name) => name in assets.party);
  return {
    version: BATTLE_STATE_VERSION,
    rules: { compat: { ...LEGACY_COMPAT, ...opts.compat } },
    nextId: 1,
    board: {
      rows,
      cols,
      mask: setup.mask ? setup.mask.map((row) => [...row]) : null,
      elevation: Array.from({ length: rows }, () => new Array<number>(cols).fill(0)),
      ramps: [],
      theme: setup.theme || 'stone',
      lights: [],
      lightGroups: [],
      ambient: 'bright',
      dmReveal: true,
    },
    units: [],
    graveyard: [],
    enemyInstanceCounts: {},
    turn: {
      started: false,
      ended: false,
      roundStartMode: 'NORMAL',
      order: [],
      currentIndex: 0,
      round: 1,
      initiative: {},
      pendingTies: [],
      enemiesDefeated: 0,
      victory: null,
      placementQueue: queue,
    },
    pending: null,
    log: [],
  };
}
