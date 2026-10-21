/**
 * DM tools added for the Spotlight battle UI: typed damage/healing, statuses
 * applied by hand, freeform turn order (reorder / delay / ready), queued
 * reinforcements and round timers. None of these ever block an action.
 */
import { err } from '../errors.ts';
import { applyDamage, applyHealing, beginTurn, isTargetDead, removeDefeated } from '../rules/apply.ts';
import { applyStatus, stampStatus, syncSheetAttributes } from '../rules/statuses.ts';
import { settleTotalAtIndex } from '../rules/turnOrder.ts';
import { combatantById, unitName } from '../selectors/board.ts';
import { health } from '../selectors/stats.ts';
import type { Combatant, EngineContext, UnitId } from '../types.ts';
import { log, nextId, type Emit, type HandlerMap } from './_shared.ts';

const statusList = (u: Combatant) => (u.kind === 'entity' ? u.sheet.status : u.statuses);
const sheetChanged = (u: Combatant, emit: Emit) => {
  if (u.kind === 'entity') {
    syncSheetAttributes(u.sheet);
    emit({ type: 'sheetChanged', sourceName: u.sourceName });
  }
};

type Draft = Parameters<NonNullable<HandlerMap['NEXT_TURN']>>[0];

/** Start the turn of whoever now sits at currentIndex (after the previous one left the order). */
function advanceToCurrent(draft: Draft, ctx: EngineContext, emit: Emit): void {
  const order = draft.turn.order;
  if (order.length === 0) return;
  if (draft.turn.currentIndex >= order.length) {
    draft.turn.currentIndex = 0;
    draft.turn.round++;
    if (draft.turn.pendingTies.length > 0)
      draft.pending = { kind: 'tieOrder', groups: draft.turn.pendingTies.map((g) => [...g]) };
  }
  const cur = combatantById(draft, order[draft.turn.currentIndex] as UnitId);
  if (cur) beginTurn(draft, cur, ctx, emit);
}

export const dmHandlers: HandlerMap = {
  APPLY_HP(draft, cmd, ctx, emit) {
    const u = combatantById(draft, cmd.unitId);
    if (!u) return err('unknownUnit', 'select an entity or enemy');
    const delta = Math.trunc(cmd.delta);
    if (!Number.isFinite(delta) || delta === 0) return err('invalidAmount', 'enter an amount');
    if (delta < 0) {
      applyDamage(u, -delta, draft.rules.compat);
      emit({ type: 'floatText', unitId: u.id, text: `${delta}`, color: '#ff7b6b', kind: 'DAMAGE' });
      log(draft, `${unitName(u)} takes ${-delta} damage`);
      sheetChanged(u, emit);
      if (isTargetDead(u)) removeDefeated(draft, u, ctx, emit);
    } else {
      const healed = applyHealing(u, delta);
      emit({ type: 'floatText', unitId: u.id, text: `+${healed}`, color: '#7ee787', kind: 'HEAL' });
      log(draft, `${unitName(u)} heals ${healed} (${health(u)} HP)`);
      sheetChanged(u, emit);
    }
    return undefined;
  },

  ADD_STATUS(draft, cmd, _ctx, emit) {
    const u = combatantById(draft, cmd.unitId);
    if (!u) return err('unknownUnit', 'statuses go on entities and enemies');
    const name = cmd.status.name.trim();
    if (!name) return err('invalidStatus', 'name the status');
    const stamped = stampStatus(
      { ...cmd.status, name, extra: { ...cmd.status.extra } },
      { source: cmd.source, appliedRound: draft.turn.round },
    );
    applyStatus(u, stamped);
    emit({ type: 'floatText', unitId: u.id, text: name, color: '#c9b6ff', kind: 'STATUS' });
    log(draft, `${unitName(u)} is ${name}${cmd.source ? ` (${cmd.source})` : ''}`);
    sheetChanged(u, emit);
    return undefined;
  },

  UPDATE_STATUS(draft, cmd, _ctx, emit) {
    const u = combatantById(draft, cmd.unitId);
    if (!u) return err('unknownUnit', 'no such combatant');
    const s = statusList(u).find((x) => x.name === cmd.name);
    if (!s) return err('unknownStatus', `${unitName(u)} is not ${cmd.name}`);
    if (cmd.patch.magnitude !== undefined) s.magnitude = Math.trunc(cmd.patch.magnitude);
    if (cmd.patch.duration !== undefined) {
      s.duration = Math.trunc(cmd.patch.duration);
      const full = typeof s.extra.fullDuration === 'number' ? s.extra.fullDuration : 0;
      if (s.duration > full) s.extra = { ...s.extra, fullDuration: s.duration };
    }
    sheetChanged(u, emit);
    return undefined;
  },

  REMOVE_STATUS(draft, cmd, _ctx, emit) {
    const u = combatantById(draft, cmd.unitId);
    if (!u) return err('unknownUnit', 'no such combatant');
    const list = statusList(u);
    if (!list.some((x) => x.name === cmd.name))
      return err('unknownStatus', `${unitName(u)} is not ${cmd.name}`);
    if (u.kind === 'entity') u.sheet.status = list.filter((x) => x.name !== cmd.name);
    else u.statuses = list.filter((x) => x.name !== cmd.name);
    emit({ type: 'statusExpired', unitId: u.id, name: cmd.name });
    log(draft, `${cmd.name} ended on ${unitName(u)}`);
    sheetChanged(u, emit);
    return undefined;
  },

  REORDER_TURN(draft, cmd) {
    const order = draft.turn.order;
    const from = order.indexOf(cmd.unitId);
    if (from === -1) return err('notInOrder', 'that combatant is not in the turn order');
    const acting = order[draft.turn.currentIndex];
    order.splice(from, 1);
    const to = Math.max(0, Math.min(order.length, Math.trunc(cmd.toIndex)));
    order.splice(to, 0, cmd.unitId);
    // whoever is acting keeps acting: a reorder changes who goes next, not whose turn it is
    if (acting !== undefined) draft.turn.currentIndex = Math.max(0, order.indexOf(acting));
    settleTotalAtIndex(draft, cmd.unitId);
    const u = combatantById(draft, cmd.unitId);
    log(draft, `${u ? unitName(u) : cmd.unitId} moved in the turn order`);
    return undefined;
  },

  DELAY_TURN(draft, cmd, ctx, emit) {
    if (!draft.turn.started) return err('notStarted', 'begin the battle first');
    const order = draft.turn.order;
    const idx = order.indexOf(cmd.unitId);
    if (idx === -1) return err('notInOrder', 'that combatant is not in the turn order');
    const wasCurrent = idx === draft.turn.currentIndex;
    order.splice(idx, 1);
    (draft.turn.held ??= []).push(cmd.unitId);
    if (idx < draft.turn.currentIndex) draft.turn.currentIndex--;
    const u = combatantById(draft, cmd.unitId);
    log(draft, `${u ? unitName(u) : cmd.unitId} delays`);
    if (wasCurrent) advanceToCurrent(draft, ctx, emit);
    return undefined;
  },

  RETURN_FROM_HOLD(draft, cmd, ctx, emit) {
    const held = draft.turn.held ?? [];
    if (!held.includes(cmd.unitId)) return err('notHeld', 'that combatant is not delaying');
    draft.turn.held = held.filter((x) => x !== cmd.unitId);
    const order = draft.turn.order;
    const u = combatantById(draft, cmd.unitId);
    if (cmd.actNow) {
      // steps in right now, ahead of whoever was acting (who goes right after)
      const at = Math.min(draft.turn.currentIndex, order.length);
      order.splice(at, 0, cmd.unitId);
      draft.turn.currentIndex = at;
      settleTotalAtIndex(draft, cmd.unitId);
      if (u) beginTurn(draft, u, ctx, emit);
    } else {
      const to = Math.max(0, Math.min(order.length, Math.trunc(cmd.index)));
      order.splice(to, 0, cmd.unitId);
      if (to <= draft.turn.currentIndex && order.length > 1) draft.turn.currentIndex++;
      settleTotalAtIndex(draft, cmd.unitId);
    }
    log(draft, `${u ? unitName(u) : cmd.unitId} rejoins the turn order`);
    return undefined;
  },

  SET_READIED(draft, cmd) {
    const u = combatantById(draft, cmd.unitId);
    if (!u) return err('unknownUnit', 'no such combatant');
    const readied = (draft.turn.readied ??= {});
    if (cmd.note === null) {
      delete readied[cmd.unitId];
      log(draft, `${unitName(u)}'s readied action is cleared`);
    } else {
      readied[cmd.unitId] = cmd.note.trim() || 'readied';
      log(draft, `${unitName(u)} readies: ${readied[cmd.unitId]}`);
    }
    return undefined;
  },

  ADD_ARRIVAL(draft, cmd, ctx) {
    const tpl = ctx.assets.enemies[cmd.templateStem];
    if (!tpl) return err('unknownEnemy', `no enemy template ${cmd.templateStem}`);
    const count = Math.max(1, Math.trunc(cmd.count));
    const round = Math.max(1, Math.trunc(cmd.round));
    (draft.turn.arrivals ??= []).push({
      id: nextId(draft, 'a'),
      templateStem: cmd.templateStem,
      count,
      round,
      ...(cmd.note ? { note: cmd.note } : {}),
    });
    log(draft, `${count}× ${tpl.name} expected in round ${round}`);
    return undefined;
  },

  REMOVE_ARRIVAL(draft, cmd) {
    const list = draft.turn.arrivals ?? [];
    if (!list.some((a) => a.id === cmd.id)) return err('unknownArrival', 'no such arrival');
    draft.turn.arrivals = list.filter((a) => a.id !== cmd.id);
    return undefined;
  },

  ADD_TIMER(draft, cmd) {
    const name = cmd.timer.name.trim();
    if (!name) return err('invalidTimer', 'name the timer');
    (draft.turn.timers ??= []).push({
      ...cmd.timer,
      name,
      round: Math.max(1, Math.trunc(cmd.timer.round)),
      id: nextId(draft, 't'),
    });
    return undefined;
  },

  REMOVE_TIMER(draft, cmd) {
    const list = draft.turn.timers ?? [];
    if (!list.some((t) => t.id === cmd.id)) return err('unknownTimer', 'no such timer');
    draft.turn.timers = list.filter((t) => t.id !== cmd.id);
    return undefined;
  },
};
