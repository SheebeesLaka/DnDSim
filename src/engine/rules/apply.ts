/** Damage, healing, defeat, dying and removal (R6.11–R6.13, R8.10, F-5, F-14). */
import type { Draft } from 'immer';
import type { Emit } from '../commands/_shared.ts';
import { log } from '../commands/_shared.ts';
import { combatantById, unitById, unitName } from '../selectors/board.ts';
import { isDead } from '../selectors/stats.ts';
import type {
  BattleState,
  Combatant,
  CompatLike,
  EngineContext,
  TerrainUnit,
  Unit,
  UnitId,
} from '../types.ts';
import { removeFromOrder } from './turnOrder.ts';
import { runTurnStart } from './turnStart.ts';

/** F-14 fixed: party members drop to dying at 0 HP instead of leaving the board. */
export const dropsToDying = (u: Unit, compat: CompatLike): boolean =>
  u.kind === 'entity' && u.sheet.isParty && !compat.entityNegativeHpPersists;

/** CombatManager.applyDamage (F-14 fixed: HP clamps at 0). */
export function applyDamage(target: Unit, dmg: number, compat: CompatLike): void {
  if (target.kind === 'entity') {
    const hp = target.sheet.currentHP - dmg;
    target.sheet.currentHP = compat.entityNegativeHpPersists ? hp : Math.max(0, hp);
  } else if (target.kind === 'enemy') {
    target.health = Math.max(0, target.health - dmg);
  } else if (target.kind === 'terrain') {
    target.health -= dmg;
  }
}

/** CombatManager.applyHealing: capped at max; returns HP actually restored. Any healing ends dying. */
export function applyHealing(target: Combatant, amount: number): number {
  if (target.kind === 'entity') {
    const before = target.sheet.currentHP;
    target.sheet.currentHP = Math.min(target.sheet.totalHP, before + amount);
    if (target.sheet.currentHP > 0) target.dying = null;
    return target.sheet.currentHP - before;
  }
  const before = target.health;
  target.health = Math.max(0, Math.min(before + amount, target.maxHealth));
  return target.health - before;
}

export const isTargetDead = (u: Unit): boolean =>
  u.kind === 'terrain' ? u.health <= 0 : u.kind === 'pickup' ? false : isDead(u);

/**
 * Remove a combatant (defeat or Delete) from the board and the turn order.
 * F-5: when the current combatant goes, Java leaves the index on the next unit
 * without its turn-start processing; the fixed path processes it.
 */
export function removeCombatant(
  draft: Draft<BattleState>,
  id: UnitId,
  reason: 'defeated' | 'deleted',
  ctx: EngineContext,
  emit: Emit,
): void {
  const unit = unitById(draft, id);
  if (!unit || (unit.kind !== 'entity' && unit.kind !== 'enemy')) return;
  const wasCurrent = draft.turn.started && draft.turn.order[draft.turn.currentIndex] === id;
  draft.units = draft.units.filter((u) => u.id !== id);
  removeFromOrder(draft, id);
  if (unit.kind === 'entity' && unit.sheet.isParty) {
    draft.graveyard.push(unit);
    emit({ type: 'sheetChanged', sourceName: unit.sourceName });
  }
  if (unit.kind === 'enemy' && reason === 'defeated') draft.turn.enemiesDefeated++;
  emit({ type: 'unitRemoved', unitId: id, reason });
  log(draft, `${unitName(unit)} ${reason === 'defeated' ? 'defeated' : 'removed'}`);
  if (wasCurrent && !draft.rules.compat.removeCurrentSkipsNext && draft.turn.order.length > 0) {
    const next = combatantById(draft, draft.turn.order[draft.turn.currentIndex] as UnitId);
    if (next) {
      runTurnStart(draft, next, emit);
      emit({ type: 'turnChanged', unitId: next.id, round: draft.turn.round });
    }
  }
}

/** BattleGridCanvas.removeDefeated: entities/enemies leave; destroyed terrain is swept. */
export function removeDefeated(
  draft: Draft<BattleState>,
  target: Unit,
  ctx: EngineContext,
  emit: Emit,
): void {
  // F-14 fixed: a party member stays on the board, dying, until the DM resolves it
  // (RESOLVE_DYING: recover / hold on / perish); more damage while dying changes nothing
  if (dropsToDying(target, draft.rules.compat)) {
    const e = unitById(draft, target.id);
    if (e?.kind === 'entity') {
      if (!e.dying) {
        e.dying = { successes: 0, failures: 0 };
        emit({ type: 'floatText', unitId: e.id, text: 'Dying', color: '#ff6b6b', kind: 'OTHER' });
        emit({ type: 'sheetChanged', sourceName: e.sourceName });
        log(draft, `${unitName(e)} falls and is dying`);
      }
      return;
    }
  }
  if (target.kind === 'entity' || target.kind === 'enemy') {
    removeCombatant(draft, target.id, 'defeated', ctx, emit);
  } else if (target.kind === 'terrain') {
    const destroyed = draft.units.filter((u): u is TerrainUnit => u.kind === 'terrain' && u.health <= 0);
    draft.units = draft.units.filter((u) => !(u.kind === 'terrain' && u.health <= 0));
    for (const t of destroyed) {
      emit({ type: 'unitRemoved', unitId: t.id, reason: 'destroyed' });
      log(draft, `${t.type} destroyed`);
    }
  }
}
