/**
 * The player window's store: a read-only mirror fed by snapshots from the DM.
 * It never reduces commands; it only holds the latest document and replays
 * the events that came with it (floating text) to its subscribers.
 */
import type { BattleEvent } from '../engine/types.ts';
import type { BoardVM } from '../engine/view/boardViewModel.ts';
import type { CameraPose } from '../ui/renderer/BoardRenderer.ts';
import type { Transport, WireMessage } from './transport/Transport.ts';

export interface ReplicaDoc {
  vm: BoardVM | null;
  prefs: Record<string, string>;
  victory: { name: string; hp: number; maxHp: number; statuses: string[] }[] | null;
  seq: number;
}

export class ReplicaStore {
  private doc: ReplicaDoc = { vm: null, prefs: {}, victory: null, seq: -1 };
  private listeners = new Set<(doc: ReplicaDoc, events: BattleEvent[]) => void>();
  private cameraListeners = new Set<(pose: CameraPose) => void>();
  private lastCamera: CameraPose | null = null;
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

  /** The DM's camera, as it moves (and the latest one at once, if known). Kept off the doc: no re-render. */
  onCamera(fn: (pose: CameraPose) => void): () => void {
    this.cameraListeners.add(fn);
    if (this.lastCamera) fn(this.lastCamera);
    return () => this.cameraListeners.delete(fn);
  }

  receive(m: WireMessage): void {
    if (m.t === 'camera') {
      this.lastCamera = m.pose;
      for (const l of [...this.cameraListeners]) l(m.pose);
      return;
    }
    if (m.t === 'snapshot') {
      // ignore stale, out-of-order snapshots from a previous DM session
      if (m.seq < this.doc.seq && this.doc.seq - m.seq < 1_000_000) return;
      this.doc = { ...this.doc, vm: m.vm, seq: m.seq };
      for (const l of [...this.listeners]) l(this.doc, m.events);
    } else if (m.t === 'victory') {
      this.doc = { ...this.doc, victory: m.party, seq: m.seq };
      for (const l of [...this.listeners]) l(this.doc, []);
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
  getSnapshot: () => BoardVM,
  getPrefs: () => Record<string, string>,
): {
  publish: (events: BattleEvent[]) => void;
  publishPrefs: () => void;
  publishVictory: (party: ReplicaDoc['victory']) => void;
  publishCamera: (pose: CameraPose) => void;
  stop: () => void;
} {
  let camera: CameraPose | null = null;
  let seq = 0;
  const publish = (events: BattleEvent[]) =>
    transport.send({ t: 'snapshot', vm: getSnapshot(), events, seq: seq++ });
  const publishPrefs = () => transport.send({ t: 'prefs', prefs: getPrefs(), seq: seq++ });
  const publishVictory = (party: ReplicaDoc['victory']) =>
    transport.send({ t: 'victory', party, seq: seq++ });
  const publishCamera = (pose: CameraPose) => {
    camera = pose;
    transport.send({ t: 'camera', pose, seq: seq++ });
  };
  const unsub = transport.onMessage((m) => {
    if (m.t === 'hello') {
      publishPrefs();
      publish([]);
      if (camera) publishCamera(camera);
    }
  });
  return { publish, publishPrefs, publishVictory, publishCamera, stop: unsub };
}
