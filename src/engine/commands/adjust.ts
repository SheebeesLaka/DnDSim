/** Battle-tab sidebar adjustments (FEATURES.md §3.1, R6.13, R6.15, F-26, F-27). */
import { cycleDie } from '../dice.ts';
import { err } from '../errors.ts';
import { syncSheetAttributes } from '../rules/statuses.ts';
import { combatantById } from '../selectors/board.ts';
import { damageDice } from '../selectors/stats.ts';
import type { CharSheetDef } from '../../assets/types.ts';
import type { Combatant, EntityUnit } from '../types.ts';
import { log, type Emit, type HandlerMap } from './_shared.ts';

function setHp(u: Combatant, hp: number, emit: Emit): void {
  if (u.kind === 'entity') {
    u.sheet.currentHP = Math.max(0, Math.min(u.sheet.totalHP, Math.trunc(hp)));
    emit({ type: 'sheetChanged', sourceName: u.sourceName });
  } else {
    u.health = Math.max(0, Math.min(u.maxHealth, Math.trunc(hp)));
  }
}

export const adjustHandlers: HandlerMap = {
  SET_HP(draft, cmd, _ctx, emit) {
    const u = combatantById(draft, cmd.unitId);
    if (!u) return err('unknownUnit', 'select an entity or enemy');
    setHp(u, cmd.hp, emit); // clamps to [0, max]; a unit at 0 is NOT removed (F-26)
    return undefined;
  },
  ADJUST_HP(draft, cmd, _ctx, emit) {
    const u = combatantById(draft, cmd.unitId);
    if (!u) return err('unknownUnit', 'select an entity or enemy');
    setHp(u, (u.kind === 'entity' ? u.sheet.currentHP : u.health) + Math.trunc(cmd.delta), emit);
    return undefined;
  },
  ADJUST_AC(draft, cmd) {
    const u = combatantById(draft, cmd.unitId);
    if (!u) return err('unknownUnit', 'select an entity or enemy');
    u.acAdjustment += Math.trunc(cmd.delta);
    return undefined;
  },
  ADJUST_STAT(draft, cmd) {
    const u = combatantById(draft, cmd.unitId);
    if (!u) return err('unknownUnit', 'select an entity or enemy');
    if (cmd.attribute < 0 || cmd.attribute > 5) return err('badAttribute', 'attribute index must be 0-5');
    if (u.kind === 'entity')
      u.statAdjustment[cmd.attribute] = (u.statAdjustment[cmd.attribute] ?? 0) + Math.trunc(cmd.delta);
    else if (cmd.attribute === 1) u.dexAdjustment += Math.trunc(cmd.delta); // enemies only have a real DEX
    return undefined;
  },
  ADJUST_DICE(draft, cmd) {
    const u = combatantById(draft, cmd.unitId);
    if (!u) return err('unknownUnit', 'select an entity or enemy');
    if (cmd.tier < 0 || cmd.tier > 2) return err('badTier', 'tier must be 0-2');
    const current = damageDice(u)[cmd.tier];
    u.diceOverride[cmd.tier] = cycleDie(current, Math.sign(cmd.direction));
    return undefined;
  },
  SWAP_WEAPON(draft, cmd, _ctx, emit) {
    if (!draft.turn.started) return err('notStarted', 'begin the battle first');
    const u = combatantById(draft, cmd.unitId);
    if (!u || u.kind !== 'entity' || !u.sheet.isParty)
      return err('notParty', 'only party members swap weapons');
    const [a, b] = u.sheet.weapons;
    u.sheet.weapons = [b, a];
    u.diceOverride = [null, null, null];
    syncSheetAttributes(u.sheet);
    emit({ type: 'sheetChanged', sourceName: u.sourceName });
    log(draft, `${u.sheet.name} swaps to ${u.sheet.weapons[0]?.name ?? 'unarmed'}`);
    return undefined;
  },
  /**
   * The Java battle and the Character Sheets screen share one CharSheet object, so a sheet edit
   * shows on the combatant at once. Here the edited sheet replaces the copy held by every unit
   * (on the board or in the graveyard) drawn from it; a rename follows through to the source name
   * and the placement queue. Battle-only tweaks (AC/stat/dice adjustments) are kept.
   */
  REPLACE_SHEET(draft, cmd, _ctx, emit) {
    const next = cmd.sheet.name;
    if (!next) return err('badSheet', 'a sheet needs a name');
    let found = false;
    const apply = (u: EntityUnit) => {
      if (u.sourceName !== cmd.sourceName) return;
      found = true;
      u.sheet = JSON.parse(JSON.stringify(cmd.sheet)) as CharSheetDef;
      u.sourceName = next;
      syncSheetAttributes(u.sheet);
      emit({ type: 'sheetChanged', sourceName: next });
    };
    for (const u of draft.units) if (u.kind === 'entity') apply(u);
    for (const g of draft.graveyard) apply(g);
    if (next !== cmd.sourceName)
      draft.turn.placementQueue = draft.turn.placementQueue.map((n) => (n === cmd.sourceName ? next : n));
    if (!found && !draft.turn.placementQueue.includes(next))
      return err('unknownSheet', `${cmd.sourceName} is not in this battle`);
    return undefined;
  },
};
