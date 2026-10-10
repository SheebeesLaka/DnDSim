/** Save/load, scenarios, BroadcastChannel snapshots and fixtures all use these same bytes. */
import { LEGACY_COMPAT } from './compat.ts';
import { BATTLE_STATE_VERSION, type BattleState } from './types.ts';

export function serializeBattle(state: BattleState, pretty = true): string {
  return pretty ? JSON.stringify(state, null, 2) : JSON.stringify(state);
}

export class BattleParseError extends Error {}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Parse + sanity-check a serialised battle; fills compat flags added after the file was written. */
export function parseBattle(input: unknown): BattleState {
  const raw: unknown = typeof input === 'string' ? JSON.parse(input) : input;
  if (!isObj(raw)) throw new BattleParseError('battle state must be an object');
  if (raw.version !== BATTLE_STATE_VERSION)
    throw new BattleParseError(`unsupported battle state version ${String(raw.version)}`);
  for (const key of ['board', 'turn', 'rules'] as const)
    if (!isObj(raw[key])) throw new BattleParseError(`missing ${key}`);
  if (!Array.isArray(raw.units)) throw new BattleParseError('missing units');
  const board = raw.board as Record<string, unknown>;
  if (typeof board.rows !== 'number' || typeof board.cols !== 'number')
    throw new BattleParseError('board needs rows and cols');
  const rules = raw.rules as Record<string, unknown>;
  const state = raw as unknown as BattleState;
  state.rules = { compat: { ...LEGACY_COMPAT, ...(isObj(rules.compat) ? rules.compat : {}) } };
  state.graveyard ??= [];
  state.enemyInstanceCounts ??= {};
  state.log ??= [];
  state.pending ??= null;
  state.board.ramps ??= [];
  state.board.lights ??= [];
  state.board.lightGroups ??= [];
  state.board.ambient ??= 'bright';
  state.board.dmReveal ??= true;
  state.turn.placementQueue ??= [];
  state.turn.pendingTies ??= [];
  return state;
}

export const cloneBattle = (state: BattleState): BattleState => parseBattle(serializeBattle(state, false));
