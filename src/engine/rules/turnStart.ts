/** Turn-start processing shared by Next, Begin, removals and the freeform turn-order commands. */
import type { Draft } from 'immer';
import { log, type Emit } from '../commands/_shared.ts';
import { unitName } from '../selectors/board.ts';
import { health } from '../selectors/stats.ts';
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
  const hpBefore = health(u);
  for (const m of turnStartProcessing(u, draft.rules.compat, expired)) log(draft, `${unitName(u)} — ${m}`);
  // what statuses and turn-start abilities did to HP, shown like any damage or healing
  const delta = health(u) - hpBefore;
  if (delta !== 0)
    emit({
      type: 'floatText',
      unitId: u.id,
      text: delta > 0 ? `+${delta}` : `${delta}`,
      color: delta > 0 ? '#7ee08a' : '#ff7b6b',
      kind: delta > 0 ? 'HEAL' : 'DAMAGE',
    });
  // any healing ends dying (healing over time included)
  if (u.kind === 'entity' && u.dying && u.sheet.currentHP > 0) {
    u.dying = null;
    log(draft, `${unitName(u)} is back up`);
  }
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
