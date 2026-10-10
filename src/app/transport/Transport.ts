/** One-way DM → player channel now; the same interface will carry the WebSocket relay later. */
import type { BattleEvent, BattleState } from '../../engine/types.ts';
import type { ViewSession } from '../../engine/view/boardViewModel.ts';

export type WireMessage =
  | { t: 'snapshot'; battle: BattleState; session: ViewSession; events: BattleEvent[]; seq: number }
  | { t: 'hello'; seq: number }
  | { t: 'prefs'; prefs: Record<string, string>; seq: number };

export interface Transport {
  send(msg: WireMessage): void;
  onMessage(cb: (msg: WireMessage) => void): () => void;
  close(): void;
}
