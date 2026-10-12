/** Turn-start processing shared by Next, Begin, removals and the freeform turn-order commands. */
import type { Draft } from 'immer';
import { log, type Emit } from '../commands/_shared.ts';
import { unitName } from '../selectors/board.ts';
import type { BattleState, Combatant } from '../types.ts';
import { turnStartProcessing } from './statuses.ts';

/**
 * Start `u`'s turn: statuses tick (once per round, however the DM reorders),
 * expiries are announced, and a readied action lapses. Returns false when it
 * already ran this round.
 */
export function runTurnStart(draft: Draft<BattleState>, u: Draft<Combatant>, emit: Emit): boolean {
  const ticked = (draft.turn.tickedRound ??= {});
  if (ticked[u.id] === draft.turn.round) return false;
  ticked[u.id] = draft.turn.round;
  const expired: string[] = [];
  for (const m of turnStartProcessing(u, draft.rules.compat, expired)) log(draft, `${unitName(u)} — ${m}`);
  for (const name of expired) {
    emit({ type: 'statusExpired', unitId: u.id, name });
    log(draft, `${name} wore off ${unitName(u)}`);
  }
  if (draft.turn.readied?.[u.id] !== undefined) {
    delete draft.turn.readied[u.id];
    log(draft, `${unitName(u)}'s readied action lapses`);
  }
  if (u.kind === 'entity') emit({ type: 'sheetChanged', sourceName: u.sourceName });
  return true;
}
