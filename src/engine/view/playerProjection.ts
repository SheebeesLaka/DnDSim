/**
 * The player window's view (R13.5, R13.6): applies every display.player.*
 * option, strips DM-only affordances, renames enemies, hides what stands in
 * darkness (DM reveal never leaks), and shows the DM's area template only when
 * allowed. Pure: a BoardVM in, a BoardVM out.
 */
import type { BoardVM, UnitVM } from './boardViewModel.ts';
import type { PlayerDisplayOptions } from './displayOptions.ts';

/** TimelinePane.anonymousEnemyName: "Enemy" or "Enemy N" by position in the turn order. */
export function anonymousEnemyNames(orderedEnemyIds: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const count = orderedEnemyIds.length;
  orderedEnemyIds.forEach((id, i) => out.set(id, count <= 1 ? 'Enemy' : `Enemy ${i + 1}`));
  return out;
}

export function projectForPlayer(
  vm: BoardVM,
  opts: PlayerDisplayOptions,
  turnOrder: readonly string[] = vm.turnOrder,
): BoardVM {
  const enemyIdsInOrder = turnOrder.filter((id) => vm.units.some((u) => u.id === id && u.side === 'enemy'));
  // enemies not (yet) in the order get numbered after the ordered ones so names stay unique
  for (const u of vm.units)
    if (u.side === 'enemy' && !enemyIdsInOrder.includes(u.id)) enemyIdsInOrder.push(u.id);
  const names = anonymousEnemyNames(enemyIdsInOrder);
  const renamed = (u: { id: string; side: string; name: string }): string =>
    !opts.enemyNames && u.side === 'enemy' ? (names.get(u.id) ?? 'Enemy') : u.name;

  const units: UnitVM[] = vm.units
    .filter((u) => !u.inDarkness)
    .map((u) => {
      const enemy = u.side === 'enemy';
      return {
        ...u,
        name: renamed(u),
        selected: false,
        showHpRing: enemy ? opts.enemyHp !== 'HIDDEN' && u.showHpRing : u.showHpRing,
        // on the board EXACT and VAGUE look the same (F-42); numbers live in the strip
        showHpNumbers: enemy
          ? opts.enemyHp === 'EXACT' && u.showHpNumbers
          : u.side === 'party'
            ? opts.partyHpNumbers
            : u.showHpNumbers,
        ac: null,
        mob: null,
      };
    });

  const strip = vm.strip.map((e) => {
    const enemy = e.side === 'enemy';
    return {
      ...e,
      name: renamed(e),
      initiative: null,
      showHpBar: enemy ? opts.enemyHp !== 'HIDDEN' : true,
      showHpNumbers: enemy ? opts.enemyHp === 'EXACT' : e.side === 'party' ? opts.partyHpNumbers : true,
    };
  });

  return {
    ...vm,
    dmReveal: false,
    units,
    // players only see a tombstone on a tile they can see
    graves: (vm.graves ?? []).filter((g) => vm.cells[g.r]?.[g.c]?.light !== 'dark'),
    strip,
    showStrip: opts.turnStrip,
    banner: null,
    highlights: {
      placement: [],
      move: [],
      attack: [],
      castRange: [],
      castTargets: [],
      areaTemplate: opts.spellTemplates ? vm.highlights.areaTemplate : [],
      areaUnits: opts.spellTemplates
        ? vm.highlights.areaUnits.filter((id) => units.some((u) => u.id === id))
        : [],
    },
    view: 'player',
  };
}
