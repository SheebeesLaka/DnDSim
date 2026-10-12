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
  // freeform bookkeeping: a removed combatant is no longer held, readied or ticked
  if (draft.turn.held) draft.turn.held = draft.turn.held.filter((x) => x !== id);
  if (draft.turn.readied) delete draft.turn.readied[id];
  if (draft.turn.tickedRound) delete draft.turn.tickedRound[id];
}

/**
 * Give `id` (already moved to its new index in the order) an initiative total
 * between its neighbours, so a later re-sort (rollAndInsert when someone joins)
 * keeps the DM's manual order. The d20 / mod shown to people stay as rolled.
 */
export function settleTotalAtIndex(draft: Draft<BattleState>, id: UnitId): void {
  const order = draft.turn.order;
  const init = draft.turn.initiative;
  const idx = order.indexOf(id);
  if (idx === -1) return;
  const prev = idx > 0 ? init[order[idx - 1] as UnitId]?.total : undefined;
  const next = idx < order.length - 1 ? init[order[idx + 1] as UnitId]?.total : undefined;
  const total =
    prev !== undefined && next !== undefined
      ? (prev + next) / 2
      : prev !== undefined
        ? prev - 1
        : next !== undefined
          ? next + 1
          : (init[id]?.total ?? 0);
  const cur = init[id];
  init[id] = cur ? { ...cur, total } : { total, d20: 0, mod: 0 };
}

export const initiativeFloat = (id: UnitId, roll: number, isEnemy: boolean): BattleEvent => ({
  type: 'floatText',
  unitId: id,
  text: `d20 ${roll}`,
  color: roll === 20 ? '#FFD700' : '#6ec6ff',
  kind: isEnemy ? 'INITIATIVE' : 'OTHER',
});
