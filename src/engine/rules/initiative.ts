/** TurnManager.calculateInitiativeOrder / resolveTies / applyTieResolution (R8.1–R8.6). */
import type { Draft } from 'immer';
import { clamp } from '../math.ts';
import { d20, shuffled, type Rng } from '../rng.ts';
import { combatantById, isParty } from '../selectors/board.ts';
import { initiativeModifier } from '../selectors/stats.ts';
import type { BattleState, Combatant, UnitId } from '../types.ts';

/** TurnManager.isPartyMember, with the F-7 flag: when off, every entity is party-side. */
export function isPartySide(u: Combatant, compat: BattleState['rules']['compat']): boolean {
  if (u.kind !== 'entity') return false;
  return compat.npcEntitiesLegacySide ? isParty(u) : true;
}

export function calculateInitiativeOrder(
  draft: Draft<BattleState>,
  partyRolls: Record<UnitId, number>,
  rng: Rng,
): void {
  const compat = draft.rules.compat;
  draft.turn.initiative = {};
  draft.turn.pendingTies = [];
  const mode = draft.turn.roundStartMode;
  for (const id of draft.turn.order) {
    const u = combatantById(draft, id);
    if (!u) continue;
    const typed = partyRolls[id];
    const roll =
      u.kind === 'entity' && isParty(u) && typed !== undefined ? clamp(Math.trunc(typed), 1, 20) : d20(rng);
    const mod = initiativeModifier(u);
    let total = roll + mod;
    const party = isPartySide(u, compat);
    if ((mode === 'SURPRISE' && party) || (mode === 'AMBUSH' && !party)) total += 100;
    draft.turn.initiative[id] = { total, d20: roll, mod };
  }
  // Java List.sort is stable; descending by total
  const init = draft.turn.initiative;
  draft.turn.order.sort((a, b) => (init[b]?.total ?? 0) - (init[a]?.total ?? 0));
  resolveTies(draft, rng);
  draft.turn.currentIndex = 0;
  draft.turn.round = 1;
}

function resolveTies(draft: Draft<BattleState>, rng: Rng): void {
  const order = draft.turn.order;
  const groups = new Map<number, UnitId[]>();
  for (const id of order) {
    const t = draft.turn.initiative[id]?.total ?? 0;
    const g = groups.get(t);
    if (g) g.push(id);
    else groups.set(t, [id]);
  }
  for (const tied of groups.values()) {
    if (tied.length <= 1) continue;
    const party: UnitId[] = [];
    const others: UnitId[] = [];
    for (const id of tied) {
      const u = combatantById(draft, id);
      if (u && isPartySide(u, draft.rules.compat)) party.push(id);
      else others.push(id);
    }
    let needsCoinFlip = [...others];
    if (others.length > 0 && party.length > 0) needsCoinFlip = [...needsCoinFlip, ...party];
    let partyPending = party;
    if (needsCoinFlip.length > 1) {
      const flipped = shuffled(needsCoinFlip, rng);
      const startIdx = order.indexOf(tied[0] as UnitId);
      for (let i = 0; i < flipped.length; i++) {
        const idx = order.indexOf(flipped[i] as UnitId);
        if (idx !== startIdx + i) {
          const tmp = order[idx] as UnitId;
          order[idx] = order[startIdx + i] as UnitId;
          order[startIdx + i] = tmp;
        }
      }
      partyPending = [];
    }
    if (partyPending.length > 1) draft.turn.pendingTies.push([...partyPending]);
  }
}

/** TurnManager.applyTieResolution: swap the chosen order into the group's slots and forget the group. */
export function applyTieResolution(draft: Draft<BattleState>, group: UnitId[], chosen: UnitId[]): boolean {
  const order = draft.turn.order;
  if (group.length === 0 || chosen.length === 0) return false;
  let startIdx = -1;
  for (const id of group) {
    const idx = order.indexOf(id);
    if (idx !== -1 && (startIdx === -1 || idx < startIdx)) startIdx = idx;
  }
  if (startIdx === -1) return false;
  for (let i = 0; i < chosen.length; i++) {
    const cur = order.indexOf(chosen[i] as UnitId);
    if (cur !== -1 && cur !== startIdx + i) {
      const tmp = order[cur] as UnitId;
      order[cur] = order[startIdx + i] as UnitId;
      order[startIdx + i] = tmp;
    }
  }
  const key = [...group].sort().join('|');
  draft.turn.pendingTies = draft.turn.pendingTies.filter((g) => [...g].sort().join('|') !== key);
  return true;
}

/** TurnManager.getInitiativeRoll: strip the surprise bonus for display (`> 100`). */
export const displayInitiative = (total: number): number => (total > 100 ? total - 100 : total);
