/** One-way DM → player channel now; the same interface will carry the WebSocket relay later. */
import type { BattleEvent } from '../../engine/types.ts';
import type { BoardVM } from '../../engine/view/boardViewModel.ts';

export type WireMessage =
  | { t: 'snapshot'; vm: BoardVM; events: BattleEvent[]; seq: number }
  | {
      t: 'victory';
      party: { name: string; hp: number; maxHp: number; statuses: string[] }[] | null;
      seq: number;
    }
  | { t: 'hello'; seq: number }
  | { t: 'prefs'; prefs: Record<string, string>; seq: number };

export interface Transport {
  send(msg: WireMessage): void;
  onMessage(cb: (msg: WireMessage) => void): () => void;
  close(): void;
}
