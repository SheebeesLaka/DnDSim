/** CombatManager targeting helpers (R7.4, R7.5) and SpellArea (R7.8–R7.10). */
import type { SpellDef } from '../../assets/types.ts';
import { javaRound, manhattan, signum } from '../math.ts';
import { combatants, inBounds, isEnabled } from '../selectors/board.ts';
import { isDead } from '../selectors/stats.ts';
import type { BattleState, Cell, Combatant, Unit } from '../types.ts';
import { isAreaSpell, isFriendlySpell, isSelfCenteredArea } from './combat.ts';

/** Hostility is side-based: Enemy vs every Entity (R7.4). */
export const isHostile = (a: Unit, b: Unit): boolean => (a.kind === 'enemy') !== (b.kind === 'enemy');

/** CombatManager.isInRange: Manhattan ≤ max(1, range); self always in range. */
export function isInRange(caster: Unit, target: Unit, range: number): boolean {
  if (caster.id === target.id) return true;
  return manhattan(caster.r, caster.c, target.r, target.c) <= Math.max(1, range);
}

/** CombatManager.isValidSpellTarget (range not considered). */
export function isValidSpellTarget(caster: Combatant, target: Unit | null, spell: SpellDef): boolean {
  if (!target) return false;
  const type = spell.targetType;
  if (type === 'SELF') return target.id === caster.id;
  if (target.kind === 'terrain')
    return (spell.resolution === 'ATTACK' || spell.resolution === 'AUTO') && type !== 'ALLY';
  if (target.kind !== 'entity' && target.kind !== 'enemy') return false;
  if (type === 'ANY') return true;
  const hostile = isHostile(caster, target);
  if (type === 'ALLY') return !hostile;
  return hostile && target.id !== caster.id;
}

/** SpellArea.isAimValid */
export function isAimValid(state: BattleState, spell: SpellDef, caster: Combatant, aim: Cell): boolean {
  if (!inBounds(state, aim.r, aim.c)) return false;
  if (isSelfCenteredArea(spell)) return true;
  if (spell.area === 'BURST') {
    return (
      manhattan(caster.r, caster.c, aim.r, aim.c) <= Math.max(1, spell.range) &&
      isEnabled(state, aim.r, aim.c)
    );
  }
  return aim.r !== caster.r || aim.c !== caster.c;
}

/** SpellArea.cells: enabled cells covered by the template for the given aim. */
export function areaCells(state: BattleState, spell: SpellDef, caster: Combatant, aim: Cell): Cell[] {
  const out: Cell[] = [];
  if (!isAreaSpell(spell) || !isAimValid(state, spell, caster, aim)) return out;
  const add = (r: number, c: number) => {
    if (inBounds(state, r, c) && isEnabled(state, r, c)) out.push({ r, c });
  };
  const cr = caster.r,
    cc = caster.c;
  const size = Math.max(1, spell.areaSize);
  switch (spell.area) {
    case 'BURST': {
      const self = isSelfCenteredArea(spell);
      const r0 = self ? cr : aim.r,
        c0 = self ? cc : aim.c;
      for (let r = r0 - size; r <= r0 + size; r++) {
        for (let c = c0 - size; c <= c0 + size; c++) {
          if (Math.abs(r - r0) + Math.abs(c - c0) > size) continue;
          if (self && r === cr && c === cc) continue;
          add(r, c);
        }
      }
      break;
    }
    case 'CONE': {
      const dr = aim.r - cr,
        dc = aim.c - cc;
      const fr = Math.abs(dr) >= Math.abs(dc) ? signum(dr) : 0;
      const fc = fr === 0 ? signum(dc) : 0;
      for (let f = 1; f <= size; f++) {
        const half = Math.trunc(f / 2);
        for (let l = -half; l <= half; l++) add(cr + fr * f + fc * l, cc + fc * f + fr * l);
      }
      break;
    }
    case 'LINE': {
      const dr = aim.r - cr,
        dc = aim.c - cc;
      const steps = Math.max(Math.abs(dr), Math.abs(dc));
      const sr = dr / steps,
        sc = dc / steps;
      const seen = new Set<string>();
      for (let i = 1; i <= size; i++) {
        const r = javaRound(cr + sr * i),
          c = javaRound(cc + sc * i);
        const key = `${r},${c}`;
        if (!seen.has(key)) {
          seen.add(key);
          add(r, c);
        }
      }
      break;
    }
    case 'NONE':
      break;
  }
  return out;
}

/** SpellArea.targets: living (or dying) combatants on covered cells, filtered by side and friendlyFire. */
export function areaTargets(
  state: BattleState,
  spell: SpellDef,
  caster: Combatant,
  cells: readonly Cell[],
): Combatant[] {
  const covered = new Set(cells.map((c) => `${c.r},${c.c}`));
  const out: Combatant[] = [];
  for (const u of combatants(state)) {
    if (!covered.has(`${u.r},${u.c}`)) continue;
    if (isDead(u) && !(u.kind === 'entity' && u.dying)) continue; // a dying hero can still be hit or healed
    const hostile = isHostile(caster, u);
    const affected = isFriendlySpell(spell) ? !hostile : hostile || spell.friendlyFire;
    if (affected) out.push(u);
  }
  return out;
}
