/** One-way DM → player channel now; the same interface will carry the WebSocket relay later. */
import type { BattleEvent } from '../../engine/types.ts';
import type { BoardVM } from '../../engine/view/boardViewModel.ts';
import type { CameraPose } from '../../ui/renderer/BoardRenderer.ts';

export type WireMessage =
  | { t: 'snapshot'; vm: BoardVM; events: BattleEvent[]; seq: number }
  | {
      t: 'victory';
      party: { name: string; hp: number; maxHp: number; statuses: string[] }[] | null;
      seq: number;
    }
  | { t: 'hello'; seq: number }
  | { t: 'prefs'; prefs: Record<string, string>; seq: number }
  /** the DM's board camera, sent on every move so the TV shows the same view */
  | { t: 'camera'; pose: CameraPose; seq: number };

export interface Transport {
  send(msg: WireMessage): void;
  onMessage(cb: (msg: WireMessage) => void): () => void;
  close(): void;
}
