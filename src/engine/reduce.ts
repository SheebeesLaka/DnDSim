/**
 * The engine's single entry point: `reduce(state, command, ctx)`.
 * Pure: the same state, command, rng sequence and assets always give the same
 * result. Never throws on DM mistakes; returns `{ ok: false, error }` and the
 * unchanged state instead.
 */
import { produce } from 'immer';
import { boardHandlers } from './commands/board.ts';
import { visualHandlers } from './commands/visual.ts';
import { lifecycleHandlers } from './commands/lifecycle.ts';
import { err } from './errors.ts';
import type { BattleEvent, BattleState, Command, EngineContext, EngineError, ReduceResult } from './types.ts';
import type { Handler, HandlerMap } from './commands/_shared.ts';

/** Commands that are always allowed, even while the DM is being asked for a roll. */
const ALWAYS_ALLOWED = new Set<Command['type']>([
  'SET_ELEVATION',
  'ADJUST_ELEVATION',
  'SET_RAMP',
  'SET_ALTITUDE',
  'ADD_LIGHT',
  'UPDATE_LIGHT',
  'REMOVE_LIGHT',
  'TOGGLE_LIGHT',
  'SET_LIGHT_GROUP',
  'TOGGLE_LIGHT_GROUP',
  'SET_AMBIENT',
  'SET_DM_REVEAL',
  'SET_THEME',
  'SET_TERRAIN_BLOCKS_LIGHT',
  'SET_COMPAT',
  'SUBMIT_ROLL',
  'AUTO_FILL_AREA_ROLLS',
  'CONFIRM_PENDING',
  'CANCEL_PENDING',
  'SUBMIT_INITIATIVE',
  'CANCEL_INITIATIVE_ENTRY',
  'RESOLVE_TIE',
  'DISMISS_TIES',
]);

const registry: HandlerMap = { ...boardHandlers, ...visualHandlers, ...lifecycleHandlers };

/** Later milestones register their handlers here (lifecycle, actions, spells…). */
export function registerHandlers(handlers: HandlerMap): void {
  Object.assign(registry, handlers);
}

export function reduce(state: BattleState, command: Command, ctx: EngineContext): ReduceResult {
  const handler = registry[command.type] as Handler | undefined;
  if (!handler)
    return { ok: false, state, events: [], error: err('unknownCommand', `no handler for ${command.type}`) };
  if (state.pending && !ALWAYS_ALLOWED.has(command.type)) {
    return {
      ok: false,
      state,
      events: [],
      error: err('pendingInput', `finish or cancel the pending ${state.pending.kind} first`),
    };
  }
  const events: BattleEvent[] = [];
  let error: EngineError | undefined;
  const next = produce(state, (draft) => {
    error = handler(draft, command, ctx, (e) => events.push(e));
  });
  // Failed commands leave the state untouched but keep their feedback events (e.g. "Occupied").
  if (error) return { ok: false, state, events, error };
  return { ok: true, state: next, events };
}

/** Convenience for tests and scripts: apply a list, stopping at the first failure. */
export function reduceAll(state: BattleState, commands: Command[], ctx: EngineContext): ReduceResult {
  let cur = state;
  const events: BattleEvent[] = [];
  for (const cmd of commands) {
    const res = reduce(cur, cmd, ctx);
    events.push(...res.events);
    if (!res.ok) return { ...res, events };
    cur = res.state;
  }
  return { ok: true, state: cur, events };
}
