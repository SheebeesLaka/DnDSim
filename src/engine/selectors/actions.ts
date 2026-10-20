/** What the sidebar enables for a selection (R3.1), and the move/attack/cast highlight sets. */
import { manhattan } from '../math.ts';
import { isAreaSpell } from '../rules/combat.ts';
import { isInRange, isValidSpellTarget } from '../rules/targeting.ts';
import type { SpellDef } from '../../assets/types.ts';
import type { BattleState, Cell, Combatant, EngineAssets, Unit, UnitId } from '../types.ts';
import { canUnitStand, combatantById } from './board.ts';
import { movement } from './stats.ts';
import { castableSpells } from '../commands/spells.ts';

export interface ActionAvailability {
  move: boolean;
  attack: boolean;
  useItem: boolean;
  pickup: boolean;
  cast: boolean;
  swap: boolean;
}

export function actionAvailability(
  state: BattleState,
  unitId: UnitId | null,
  assets: EngineAssets,
): ActionAvailability {
  const none = { move: false, attack: false, useItem: false, pickup: false, cast: false, swap: false };
  if (!unitId || !state.turn.started || state.pending) return none;
  const u = combatantById(state, unitId);
  if (!u) return none;
  if (u.kind === 'enemy') return { ...none, move: true, attack: true };
  if (!u.sheet.isParty) return none;
  if (u.dying) return none; // down at 0 HP: no actions until healed
  return {
    move: true,
    attack: true,
    useItem: true,
    pickup: true,
    cast: castableSpells(u, assets).length > 0,
    swap: true,
  };
}

/** R9.1: cells with 0 < Manhattan ≤ MOB that the unit can stand on. */
export function moveTargets(state: BattleState, u: Combatant): Cell[] {
  const out: Cell[] = [];
  const mob = movement(u);
  for (let r = 0; r < state.board.rows; r++) {
    for (let c = 0; c < state.board.cols; c++) {
      const d = manhattan(u.r, u.c, r, c);
      if (d > 0 && d <= mob && canUnitStand(state, r, c)) out.push({ r, c });
    }
  }
  return out;
}

/** R6.1: every other entity, enemy and live terrain object. */
export function attackTargets(state: BattleState, attackerId: UnitId): Unit[] {
  return state.units.filter(
    (t) =>
      t.id !== attackerId &&
      (t.kind === 'entity' || t.kind === 'enemy' || (t.kind === 'terrain' && t.health > 0)),
  );
}

/** R7.5: legal single-target spell targets, with an in-range flag for the UI tint. */
export function spellTargets(
  state: BattleState,
  casterId: UnitId,
  spell: SpellDef,
): { unit: Unit; inRange: boolean }[] {
  const caster = combatantById(state, casterId);
  if (!caster || isAreaSpell(spell)) return [];
  return state.units
    .filter((t) => isValidSpellTarget(caster, t, spell))
    .map((unit) => ({ unit, inRange: isInRange(caster, unit, spell.range) }));
}

export { castableSpells };
