/**
 * The player window's store: a read-only mirror fed by snapshots from the DM.
 * It never reduces commands; it only holds the latest document and replays
 * the events that came with it (floating text) to its subscribers.
 */
import type { BattleEvent, BattleState } from '../engine/types.ts';
import type { ViewSession } from '../engine/view/boardViewModel.ts';
import type { Transport, WireMessage } from './transport/Transport.ts';

export interface ReplicaDoc {
  battle: BattleState | null;
  session: ViewSession;
  prefs: Record<string, string>;
  seq: number;
}

export class ReplicaStore {
  private doc: ReplicaDoc = {
    battle: null,
    session: { selectedId: null, mode: { kind: 'none' }, hover: null },
    prefs: {},
    seq: -1,
  };
  private listeners = new Set<(doc: ReplicaDoc, events: BattleEvent[]) => void>();
  private unsub: () => void;

  constructor(private transport: Transport) {
    this.unsub = transport.onMessage((m) => this.receive(m));
    transport.send({ t: 'hello', seq: 0 });
  }

  get state(): ReplicaDoc {
    return this.doc;
  }

  subscribe(fn: (doc: ReplicaDoc, events: BattleEvent[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  receive(m: WireMessage): void {
    if (m.t === 'snapshot') {
      // ignore stale, out-of-order snapshots from a previous DM session
      if (m.seq < this.doc.seq && this.doc.seq - m.seq < 1_000_000) return;
      this.doc = { ...this.doc, battle: m.battle, session: m.session, seq: m.seq };
      for (const l of [...this.listeners]) l(this.doc, m.events);
    } else if (m.t === 'prefs') {
      this.doc = { ...this.doc, prefs: m.prefs };
      for (const l of [...this.listeners]) l(this.doc, []);
    }
  }

  close(): void {
    this.unsub();
    this.transport.close();
  }
}

/** DM side: publish every store change as a snapshot; answer `hello` with the current one. */
export function publishStore(
  transport: Transport,
  getSnapshot: () => { battle: BattleState; session: ViewSession },
  getPrefs: () => Record<string, string>,
): { publish: (events: BattleEvent[]) => void; publishPrefs: () => void; stop: () => void } {
  let seq = 0;
  const publish = (events: BattleEvent[]) => {
    const snap = getSnapshot();
    transport.send({ t: 'snapshot', battle: snap.battle, session: snap.session, events, seq: seq++ });
  };
  const publishPrefs = () => transport.send({ t: 'prefs', prefs: getPrefs(), seq: seq++ });
  const unsub = transport.onMessage((m) => {
    if (m.t === 'hello') {
      publishPrefs();
      publish([]);
    }
  });
  return { publish, publishPrefs, stop: unsub };
}
