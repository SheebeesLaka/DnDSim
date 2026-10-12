/** Begin / initiative entry / ties / Next / End / Long Rest (FEATURES.md §2, §8). */
import { err } from '../errors.ts';
import { applyTieResolution, calculateInitiativeOrder } from '../rules/initiative.ts';
import { processEquippedAbilities } from '../rules/statuses.ts';
import { runTurnStart } from '../rules/turnStart.ts';
import { combatantById, enemies, entities, partyOnField, unitName } from '../selectors/board.ts';
import { isCaster } from '../selectors/stats.ts';
import { log, type HandlerMap } from './_shared.ts';

export const lifecycleHandlers: HandlerMap = {
  SET_ROUND_START_MODE(draft, cmd) {
    if (draft.turn.started) return err('battleStarted', 'Surp/Norm/Amb lock once the battle begins');
    draft.turn.roundStartMode = cmd.mode;
    return undefined;
  },

  BEGIN_BATTLE(draft, _cmd, ctx, emit) {
    if (draft.turn.started) return err('battleStarted', 'the battle has already begun');
    if (draft.turn.placementQueue.length > 0) return err('placementPhase', 'place every party member first');
    if (entities(draft).length === 0) {
      emit({
        type: 'alert',
        level: 'warning',
        title: 'No Entities',
        message: 'Please add at least one entity before beginning battle.',
      });
      return err('noEntities', 'no entities on the field');
    }
    const party = partyOnField(draft).map((e) => e.id);
    if (party.length === 0) return commitBegin(draft, {}, ctx, emit);
    draft.pending = { kind: 'initiativeEntry', party };
    return undefined;
  },

  CANCEL_INITIATIVE_ENTRY(draft) {
    if (draft.pending?.kind !== 'initiativeEntry') return err('notPending', 'no initiative entry open');
    draft.pending = null;
    return undefined;
  },

  SUBMIT_INITIATIVE(draft, cmd, ctx, emit) {
    if (draft.pending?.kind !== 'initiativeEntry') return err('notPending', 'no initiative entry open');
    for (const id of draft.pending.party) {
      const v = cmd.rolls[id];
      if (v === undefined || !Number.isFinite(v) || v < 1 || v > 20) {
        const who = combatantById(draft, id);
        return err(
          'invalidRoll',
          `every party member needs a d20 roll (1-20); ${who ? unitName(who) : id} is missing one`,
        );
      }
    }
    draft.pending = null;
    return commitBegin(draft, cmd.rolls, ctx, emit);
  },

  RESOLVE_TIE(draft, cmd) {
    if (draft.pending?.kind !== 'tieOrder') return err('notPending', 'no tie to resolve');
    const groupKey = [...cmd.group].sort().join('|');
    const pendingGroup = draft.pending.groups.find((g) => [...g].sort().join('|') === groupKey);
    if (!pendingGroup) return err('unknownTie', 'that group is not tied');
    if ([...cmd.order].sort().join('|') !== groupKey)
      return err('invalidOrder', 'the order must list exactly the tied members');
    applyTieResolution(draft, pendingGroup, cmd.order);
    draft.pending.groups = draft.pending.groups.filter((g) => g !== pendingGroup);
    if (draft.pending.groups.length === 0) draft.pending = null;
    log(draft, 'Initiative tie ordered by the DM');
    return undefined;
  },

  DISMISS_TIES(draft) {
    if (draft.pending?.kind !== 'tieOrder') return err('notPending', 'no tie to dismiss');
    draft.pending = null; // groups stay in turn.pendingTies and come back next round (R8.6)
    return undefined;
  },

  NEXT_TURN(draft, _cmd, _ctx, emit) {
    if (!draft.turn.started) return err('notStarted', 'begin the battle first');
    const order = draft.turn.order;
    if (order.length === 0) return undefined;
    draft.turn.currentIndex++;
    if (draft.turn.currentIndex >= order.length) {
      draft.turn.currentIndex = 0;
      draft.turn.round++;
      if (draft.turn.pendingTies.length > 0)
        draft.pending = { kind: 'tieOrder', groups: draft.turn.pendingTies.map((g) => [...g]) };
    }
    const current = combatantById(draft, order[draft.turn.currentIndex] as string);
    if (current) {
      runTurnStart(draft, current, emit);
      emit({ type: 'turnChanged', unitId: current.id, round: draft.turn.round });
    }
    return undefined;
  },

  END_BATTLE(draft, _cmd, _ctx, emit) {
    if (!draft.turn.started) return err('notStarted', 'the battle has not begun');
    draft.turn.started = false;
    draft.turn.ended = true;
    const noEnemies = enemies(draft).length === 0;
    const victory = draft.rules.compat.victoryOnAnyDefeat
      ? noEnemies || draft.turn.enemiesDefeated > 0
      : noEnemies;
    draft.turn.victory = victory;
    draft.pending = null;
    emit({ type: 'battleEnded', victory });
    log(draft, victory ? 'Victory!' : 'Battle ended');
    return undefined;
  },

  LONG_REST(draft, _cmd, _ctx, emit) {
    const casters = partyOnField(draft).filter((e) => isCaster(e.sheet));
    if (casters.length === 0) {
      emit({
        type: 'alert',
        level: 'info',
        title: 'Long Rest',
        message: 'No party spellcasters are on the board.',
      });
      return undefined;
    }
    for (const e of casters) {
      e.sheet.spellSlotsUsed = new Array<number>(9).fill(0);
      emit({ type: 'floatText', unitId: e.id, text: 'Rested', color: '#b9a8f5', kind: 'OTHER' });
      emit({ type: 'sheetChanged', sourceName: e.sourceName });
    }
    log(draft, 'Long rest: spell slots restored');
    return undefined;
  },
};

type Ctx = Parameters<NonNullable<HandlerMap['BEGIN_BATTLE']>>[2];
type Emit = Parameters<NonNullable<HandlerMap['BEGIN_BATTLE']>>[3];
type Draft = Parameters<NonNullable<HandlerMap['BEGIN_BATTLE']>>[0];

/** BattleView.commitBeginBattle */
function commitBegin(draft: Draft, rolls: Record<string, number>, ctx: Ctx, emit: Emit) {
  draft.turn.started = true;
  draft.turn.ended = false;
  draft.turn.victory = null;
  calculateInitiativeOrder(draft, rolls, ctx.rng);
  draft.turn.tickedRound = {};
  draft.turn.held = [];
  draft.turn.readied = {};
  const first = combatantById(draft, draft.turn.order[0] ?? '');
  if (first) {
    if (draft.rules.compat.beginSkipsFirstStatusTick) {
      // Java: abilities only, no procStatus, and before the tie dialog can reorder (F-3).
      // Their round-1 turn has still started: a later reorder must not tick them this round.
      (draft.turn.tickedRound ??= {})[first.id] = 1;
      if (first.kind === 'entity')
        for (const m of processEquippedAbilities(first.sheet, 'ON_TURN_START'))
          log(draft, `${unitName(first)} — ${m}`);
    } else {
      runTurnStart(draft, first, emit);
    }
  }
  if (draft.turn.pendingTies.length > 0)
    draft.pending = { kind: 'tieOrder', groups: draft.turn.pendingTies.map((g) => [...g]) };
  emit({ type: 'battleStarted' });
  emit({ type: 'turnChanged', unitId: first?.id ?? null, round: 1 });
  log(draft, `Battle begins (${draft.turn.roundStartMode.toLowerCase()})`);
  return undefined;
}
