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

  const visible = new Set(units.map((u) => u.id));
  const hpShown = (side: string): 'exact' | 'bar' | 'none' =>
    side !== 'enemy'
      ? 'exact'
      : opts.enemyHp === 'EXACT'
        ? 'exact'
        : opts.enemyHp === 'VAGUE'
          ? 'bar'
          : 'none';
  const fighter = <F extends { id: string; side: string; name: string } | null>(f: F): F =>
    f === null ? f : { ...f, name: renamed(f), hpShown: hpShown(f.side) };
  const roll = vm.roll
    ? {
        ...vm.roll,
        attacker: fighter(vm.roll.attacker),
        target: fighter(vm.roll.target),
        area:
          vm.roll.area?.map((r) => {
            const side = vm.units.find((u) => u.id === r.id)?.side ?? 'other';
            return { ...r, name: renamed({ id: r.id, side, name: r.name }) };
          }) ?? null,
      }
    : null;
  // players see what is happening, not what the DM has planned: no queued arrivals or
  // timers, no enemy readied actions, nothing about creatures they cannot see
  const effects = (vm.effects ?? [])
    .filter((r) => r.kind !== 'arrival' && r.kind !== 'timer')
    .filter((r) => !(r.kind === 'readied' && r.side === 'enemy'))
    .filter((r) => r.unitId === null || visible.has(r.unitId))
    .map((r) => {
      if (!r.unitId || !r.unitName) return r;
      const name = renamed({ id: r.unitId, side: r.side ?? 'other', name: r.unitName });
      return { ...r, unitName: name, endsLabel: r.endsLabel.replace(r.unitName.replace(/ #\d+$/, ''), name) };
    });

  return {
    ...vm,
    dmReveal: false,
    roll,
    effects,
    arrivals: [],
    field: { on: false, selectedLightId: null },
    selectedId: vm.selectedId && visible.has(vm.selectedId) ? vm.selectedId : null,
    held: (vm.held ?? []).map((e) => ({ ...e, name: renamed(e) })),
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
