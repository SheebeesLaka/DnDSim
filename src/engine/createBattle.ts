import { DEFAULT_COMPAT, type CompatFlags } from './compat.ts';
import { BATTLE_STATE_VERSION, type BattleState, type EngineAssets, type GridSetup } from './types.ts';

export interface CreateBattleOptions {
  compat?: Partial<CompatFlags>;
  /**
   * Party names to place one at a time (PartyConfig order); names without a
   * sheet are skipped, and so are characters whose sheet is marked dead.
   */
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
  const listed = (opts.partyList ?? []).filter((name) => name in assets.party);
  // the fallen stay behind (a sheet marked dead by "Perish"; untick Perished to bring them back)
  const fallen = listed.filter((name) => assets.party[name]?.dead === true);
  const queue = listed.filter((name) => !fallen.includes(name));
  return {
    version: BATTLE_STATE_VERSION,
    rules: { compat: { ...DEFAULT_COMPAT, ...opts.compat } },
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
      graves: [],
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
    log: fallen.map((name, i) => ({ n: i + 1, text: `${name} has perished and is not placed` })),
  };
}
