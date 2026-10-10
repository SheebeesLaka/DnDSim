/**
 * The DM window's single source of truth: battle state (engine) + session
 * state (UI). Every change goes through dispatch(); subscribers get the new
 * document and the events the engine emitted. The command log is kept for
 * the debug panel and bug reports.
 */
import { reduce } from '../engine/reduce.ts';
import type { BattleEvent, BattleState, Command, EngineContext, ReduceResult } from '../engine/types.ts';
import { initialSession, reduceSession, type SessionAction, type SessionState } from './session.ts';

export interface Doc {
  battle: BattleState;
  session: SessionState;
}

export type Listener = (doc: Doc, events: BattleEvent[], source: 'command' | 'session' | 'replace') => void;

export class Store {
  private doc: Doc;
  private listeners = new Set<Listener>();
  readonly commandLog: { n: number; command: Command; ok: boolean; error?: string }[] = [];

  constructor(
    battle: BattleState,
    public ctx: EngineContext,
    session: SessionState = initialSession(),
  ) {
    this.doc = { battle, session };
  }

  get state(): Doc {
    return this.doc;
  }
  get battle(): BattleState {
    return this.doc.battle;
  }
  get session(): SessionState {
    return this.doc.session;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(command: Command): ReduceResult {
    const res = reduce(this.doc.battle, command, this.ctx);
    this.commandLog.push({
      n: this.commandLog.length + 1,
      command,
      ok: res.ok,
      error: res.ok ? undefined : `${res.error.code}: ${res.error.message}`,
    });
    if (this.commandLog.length > 500) this.commandLog.shift();
    if (res.ok) {
      this.doc = { battle: res.state, session: this.reconcileSession(res.state, this.doc.session) };
      this.notify(res.events, 'command');
    } else if (res.events.length > 0) {
      this.notify(res.events, 'command');
    }
    return res;
  }

  dispatchSession(action: SessionAction): void {
    const next = reduceSession(this.doc.session, action);
    if (next === this.doc.session) return;
    this.doc = { ...this.doc, session: next };
    this.notify([], 'session');
  }

  /** Load a saved battle / scenario. Session resets. */
  replace(battle: BattleState): void {
    this.doc = { battle, session: initialSession() };
    this.notify([], 'replace');
  }

  /** Drop selection/mode that point at units which no longer exist. */
  private reconcileSession(battle: BattleState, session: SessionState): SessionState {
    const has = (id: string | null | undefined) =>
      id === null || id === undefined || battle.units.some((u) => u.id === id);
    let s = session;
    if (!has(s.selectedId)) s = { ...s, selectedId: null, mode: { kind: 'none' } };
    if ('unitId' in s.mode && !has(s.mode.unitId)) s = { ...s, mode: { kind: 'none' } };
    if (!has(s.pinnedId)) s = { ...s, pinnedId: null };
    // placement finished → leave placeObject mode for party cards
    return s;
  }

  private notify(events: BattleEvent[], source: Parameters<Listener>[2]): void {
    for (const l of [...this.listeners]) l(this.doc, events, source);
  }
}
