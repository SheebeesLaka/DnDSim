/** TurnManager.java order maintenance shared by placement, removal and lifecycle. */
import type { Draft } from 'immer';
import { d20, type Rng } from '../rng.ts';
import type { BattleEvent, BattleState, UnitId } from '../types.ts';

/** Sort descending by stored total; combatants without a roll count as 0 (rollAndInsert). */
export function sortOrderByInitiative(draft: Draft<BattleState>): void {
  const init = draft.turn.initiative;
  draft.turn.order.sort((a, b) => (init[b]?.total ?? 0) - (init[a]?.total ?? 0));
}

/**
 * TurnManager.rollAndInsert: random d20 + mod, re-sort, keep the currently acting
 * combatant by identity. Returns the raw d20 for floating-text feedback.
 */
export function rollAndInsert(draft: Draft<BattleState>, id: UnitId, mod: number, rng: Rng): number {
  const order = draft.turn.order;
  const acting = order.length ? order[Math.min(draft.turn.currentIndex, order.length - 1)] : undefined;
  const roll = d20(rng);
  draft.turn.initiative[id] = { total: roll + mod, d20: roll, mod };
  sortOrderByInitiative(draft);
  if (acting !== undefined) {
    const idx = order.indexOf(acting);
    if (idx >= 0) draft.turn.currentIndex = idx;
  }
  return roll;
}

/** TurnManager.removeEntity / removeEnemy (R8.10). */
export function removeFromOrder(draft: Draft<BattleState>, id: UnitId): void {
  const order = draft.turn.order;
  const idx = order.indexOf(id);
  if (idx !== -1) order.splice(idx, 1);
  delete draft.turn.initiative[id];
  if (idx !== -1 && idx < draft.turn.currentIndex) draft.turn.currentIndex--;
  if (draft.turn.currentIndex >= order.length && order.length > 0) {
    draft.turn.currentIndex = 0;
    if (!draft.rules.compat.removalWrapNoRoundIncrement) draft.turn.round++;
  }
  draft.turn.pendingTies = draft.turn.pendingTies
    .map((g) => g.filter((x) => x !== id))
    .filter((g) => g.length > 1);
}

export const initiativeFloat = (id: UnitId, roll: number, isEnemy: boolean): BattleEvent => ({
  type: 'floatText',
  unitId: id,
  text: `d20 ${roll}`,
  color: roll === 20 ? '#FFD700' : '#6ec6ff',
  kind: isEnemy ? 'INITIATIVE' : 'OTHER',
});
