/**
 * Resolving a dying party member (F-14 fixed). A hero at 0 HP stays on the
 * board, dying, until the DM picks an outcome from the sidebar:
 * - recover: back up with 1 HP;
 * - hold on: still dying (logged, nothing else changes);
 * - perish: removed like a defeat, a tombstone marks the tile, and their
 *   character sheet is marked dead.
 * Automated death-save rolls can replace "hold on" later.
 */
import { err } from '../errors.ts';
import { removeCombatant } from '../rules/apply.ts';
import { unitById, unitName } from '../selectors/board.ts';
import type { HandlerMap } from './_shared.ts';
import { log } from './_shared.ts';

export const dyingHandlers: HandlerMap = {
  RESOLVE_DYING(draft, cmd, ctx, emit) {
    const u = unitById(draft, cmd.unitId);
    if (!u || u.kind !== 'entity') return err('unknownUnit', 'select a party member');
    if (!u.dying) return err('notDying', `${unitName(u)} is not dying`);
    const name = unitName(u);
    if (cmd.outcome === 'recover') {
      u.dying = null;
      u.sheet.currentHP = 1;
      emit({ type: 'floatText', unitId: u.id, text: 'Recovered', color: '#7ee08a', kind: 'OTHER' });
      emit({ type: 'sheetChanged', sourceName: u.sourceName });
      log(draft, `${name} recovers with 1 HP`);
      return undefined;
    }
    if (cmd.outcome === 'hold') {
      emit({ type: 'floatText', unitId: u.id, text: 'Holding on', color: '#ffcf5a', kind: 'OTHER' });
      log(draft, `${name} holds on`);
      return undefined;
    }
    // perish: the sheet remembers it, a tombstone marks the spot, the unit leaves like a defeat
    u.dying = null;
    u.sheet.dead = true;
    (draft.board.graves ??= []).push({ id: `grave-${u.id}`, r: u.r, c: u.c, name });
    log(draft, `${name} has perished`);
    removeCombatant(draft, u.id, 'defeated', ctx, emit);
    return undefined;
  },
};
