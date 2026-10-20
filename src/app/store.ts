/**
 * The DM window's single source of truth: battle state (engine) + session
 * state (UI). Every change goes through dispatch(); subscribers get the new
 * document and the events the engine emitted. The command log is kept for
 * the debug panel and bug reports.
 */
import { reduce } from '../engine/reduce.ts';
import type { BattleEvent, BattleState, Command, EngineContext, ReduceResult } from '../engine/types.ts';
import { emptyDraft } from '../engine/view/rollPreview.ts';
import { initialSession, reduceSession, type SessionAction, type SessionState } from './session.ts';

export interface Doc {
  battle: BattleState;
  session: SessionState;
}

export type Listener = (
  doc: Doc,
  events: BattleEvent[],
  source: 'command' | 'session' | 'replace' | 'undo',
) => void;

/** One undo step: the battle as it was before, and what the step did ("Henry hits Guard #1 for 14"). */
export interface HistoryEntry {
  before: BattleState;
  label: string;
}

const HISTORY_CAP = 100;

/** A short, human label for a command when the log has nothing better. */
function commandLabel(cmd: Command): string {
  return cmd.type
    .toLowerCase()
    .split('_')
    .map((w, i) => (i === 0 ? w[0]?.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export class Store {
  private doc: Doc;
  private listeners = new Set<Listener>();
  readonly commandLog: { n: number; command: Command; ok: boolean; error?: string }[] = [];
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private historyListeners = new Set<() => void>();

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
      this.record(this.doc.battle, res.state, command);
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

  /** Load a saved battle / scenario. Session resets, and so does the undo history. */
  replace(battle: BattleState): void {
    this.doc = { battle, session: initialSession() };
    this.past = [];
    this.future = [];
    this.notify([], 'replace');
    this.notifyHistory();
  }

  // ---- undo / redo ----

  /**
   * A roll is one step: ATTACK opens it, the d20 and dice submissions join it,
   * so Undo takes back the whole attack. The label is the last log line the
   * step wrote ("Henry Keaton hits Moongate Guard #1 for 14 (tier 2)").
   */
  private record(before: BattleState, after: BattleState, command: Command): void {
    if (before === after) return;
    const newLog =
      after.log.length > 0 && after.log.at(-1) !== before.log.at(-1) ? after.log.at(-1)?.text : undefined;
    const open = this.past.at(-1);
    if (before.pending !== null && open) {
      // still inside a roll that started with the open entry
      if (newLog) open.label = newLog;
    } else {
      this.past.push({ before, label: newLog ?? commandLabel(command) });
      if (this.past.length > HISTORY_CAP) this.past.shift();
    }
    this.future = [];
    this.notifyHistory();
  }

  get history(): { undo: string | null; redo: string | null; past: readonly HistoryEntry[] } {
    return {
      undo: this.past.at(-1)?.label ?? null,
      redo: this.future.at(-1)?.label ?? null,
      past: this.past,
    };
  }

  /** Take back the last step (a whole roll counts as one). Returns its label, or null when there is nothing. */
  undo(): string | null {
    const entry = this.past.pop();
    if (!entry) return null;
    this.future.push({ before: this.doc.battle, label: entry.label });
    this.doc = { battle: entry.before, session: this.reconcileSession(entry.before, this.doc.session) };
    this.notify([], 'undo');
    this.notifyHistory();
    return entry.label;
  }

  redo(): string | null {
    const entry = this.future.pop();
    if (!entry) return null;
    this.past.push({ before: this.doc.battle, label: entry.label });
    this.doc = { battle: entry.before, session: this.reconcileSession(entry.before, this.doc.session) };
    this.notify([], 'undo');
    this.notifyHistory();
    return entry.label;
  }

  onHistory(fn: () => void): () => void {
    this.historyListeners.add(fn);
    return () => this.historyListeners.delete(fn);
  }

  private notifyHistory(): void {
    for (const l of [...this.historyListeners]) l();
  }

  /** Drop selection/mode that point at units which no longer exist. */
  private reconcileSession(battle: BattleState, session: SessionState): SessionState {
    const has = (id: string | null | undefined) =>
      id === null || id === undefined || battle.units.some((u) => u.id === id);
    let s = session;
    if (!has(s.selectedId)) s = { ...s, selectedId: null, mode: { kind: 'none' } };
    if ('unitId' in s.mode && !has(s.mode.unitId)) s = { ...s, mode: { kind: 'none' } };
    if (s.popover && !has(s.popover.unitId)) s = { ...s, popover: null };
    if (s.selectedLightId && !battle.board.lights.some((l) => l.id === s.selectedLightId))
      s = { ...s, selectedLightId: null };
    // a new roll (or the next step of one) starts with empty fields
    if (battle.pending !== this.doc.battle.pending) s = { ...s, rollDraft: emptyDraft() };
    // placement finished → leave placeObject mode for party cards
    return s;
  }

  private notify(events: BattleEvent[], source: Parameters<Listener>[2]): void {
    for (const l of [...this.listeners]) l(this.doc, events, source);
  }
}
