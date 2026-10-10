/**
 * Everything a renderer needs, computed from battle state + the DM's session
 * (selection, mode, hover). The renderer never touches BattleState directly,
 * and the player window receives a projected copy of this (playerProjection).
 */
import type { SpellDef } from '../../assets/types.ts';
import { areaCells, areaTargets } from '../rules/targeting.ts';
import { isAreaSpell, isSelfCenteredArea } from '../rules/combat.ts';
import { attackTargets, moveTargets, spellTargets } from '../selectors/actions.ts';
import {
  canUnitStand,
  combatantById,
  combatants,
  isEnabled,
  partyOnField,
  unitById,
  unitName,
} from '../selectors/board.ts';
import {
  computeLighting,
  lightLevelAt,
  lightPosition,
  isLightOn,
  type CellLight,
} from '../selectors/lighting.ts';
import { armorClass, health, maxHealth, movement } from '../selectors/stats.ts';
import { displayInitiative } from '../rules/initiative.ts';
import type { BattleState, Cell, EngineAssets, LightLevel, UnitId, UnitKind } from '../types.ts';

export type Mode =
  | { kind: 'none' }
  | { kind: 'move'; unitId: UnitId }
  | { kind: 'attack'; unitId: UnitId }
  | { kind: 'pickup'; unitId: UnitId }
  | { kind: 'cast'; unitId: UnitId; spellName: string; slotLevel: number; lockedCells?: Cell[] }
  | { kind: 'placeObject'; key: string }
  | { kind: 'elevation'; delta: number };

/** The slice of the DM session the view model depends on. */
export interface ViewSession {
  selectedId: UnitId | null;
  mode: Mode;
  hover: Cell | null;
}

export type Side = 'party' | 'enemy' | 'other';

export interface CellVM {
  r: number;
  c: number;
  enabled: boolean;
  elevation: number;
  light: LightLevel;
  ramp: { from: number; to: number; dir: 'N' | 'S' | 'E' | 'W' } | null;
}

export interface UnitVM {
  id: UnitId;
  kind: UnitKind;
  name: string;
  initials: string;
  r: number;
  c: number;
  altitude: number;
  color: string;
  side: Side;
  hp: number;
  maxHp: number;
  showHpRing: boolean;
  showHpNumbers: boolean;
  ac: number | null;
  mob: number | null;
  statuses: string[];
  selected: boolean;
  active: boolean;
  /** standing on a dark cell: dashed for the DM, absent for players */
  inDarkness: boolean;
  terrain: { collision: boolean; entityAboveTerrain: boolean; spritePath: string | null } | null;
  spritePath: string | null;
}

export interface Highlights {
  placement: Cell[];
  move: Cell[];
  attack: UnitId[];
  castRange: Cell[];
  castTargets: { id: UnitId; inRange: boolean }[];
  areaTemplate: Cell[];
  areaUnits: UnitId[];
}

export interface LightVM {
  id: string;
  name: string;
  r: number;
  c: number;
  on: boolean;
  color: string;
  brightRadius: number;
  dimRadius: number;
  attachedTo: UnitId | null;
}

export interface StripEntry {
  id: UnitId;
  name: string;
  side: Side;
  hp: number;
  maxHp: number;
  showHpNumbers: boolean;
  showHpBar: boolean;
  current: boolean;
  initiative: { total: number; d20: number; mod: number } | null;
}

export interface BoardVM {
  rows: number;
  cols: number;
  theme: string;
  ambient: LightLevel;
  dmReveal: boolean;
  cells: CellVM[][];
  units: UnitVM[];
  lights: LightVM[];
  highlights: Highlights;
  banner: string | null;
  /** 'Setup' / 'Initiative' / 'Round N' */
  phaseLabel: string;
  strip: StripEntry[];
  showStrip: boolean;
  view: 'dm' | 'player';
  turnOrder: UnitId[];
  started: boolean;
  round: number;
  /** pending DM input, for the player strip's inline initiative state */
  pendingKind: string | null;
}

const initialsOf = (name: string): string => {
  const words = name
    .replace(/#\d+$/, '')
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0] as string).slice(0, 2).toUpperCase();
  return ((words[0] as string)[0] ?? '') + ((words[1] as string)[0] ?? '');
};

const emptyHighlights = (): Highlights => ({
  placement: [],
  move: [],
  attack: [],
  castRange: [],
  castTargets: [],
  areaTemplate: [],
  areaUnits: [],
});

export function sideOf(state: BattleState, id: UnitId): Side {
  const u = unitById(state, id);
  if (!u) return 'other';
  if (u.kind === 'enemy') return 'enemy';
  if (u.kind === 'entity') return u.sheet.isParty ? 'party' : 'other';
  return 'other';
}

export function buildStrip(state: BattleState): StripEntry[] {
  const current = state.turn.order[state.turn.currentIndex];
  const ids = state.turn.started ? state.turn.order : partyOnField(state).map((e) => e.id);
  const out: StripEntry[] = [];
  for (const id of ids) {
    const u = combatantById(state, id);
    if (!u) continue;
    const init = state.turn.initiative[id];
    out.push({
      id,
      name: unitName(u),
      side: sideOf(state, id),
      hp: health(u),
      maxHp: maxHealth(u),
      showHpNumbers: true,
      showHpBar: true,
      current: state.turn.started && id === current,
      initiative: init ? { total: displayInitiative(init.total), d20: init.d20, mod: init.mod } : null,
    });
  }
  return out;
}

export function phaseLabel(state: BattleState): string {
  if (state.pending?.kind === 'initiativeEntry') return 'Initiative';
  if (state.turn.started) return `Round ${state.turn.round}`;
  return 'Setup';
}

export function buildBoardViewModel(
  state: BattleState,
  session: ViewSession,
  assets: EngineAssets,
  lighting: Map<string, CellLight> = computeLighting(state),
): BoardVM {
  const { rows, cols } = state.board;
  const cells: CellVM[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: CellVM[] = [];
    for (let c = 0; c < cols; c++) {
      const ramp = state.board.ramps.find((x) => x.r === r && x.c === c);
      row.push({
        r,
        c,
        enabled: isEnabled(state, r, c),
        elevation: state.board.elevation[r]?.[c] ?? 0,
        light: lightLevelAt(lighting, r, c),
        ramp: ramp ? { from: ramp.from, to: ramp.to, dir: ramp.dir } : null,
      });
    }
    cells.push(row);
  }

  const current = state.turn.started ? state.turn.order[state.turn.currentIndex] : undefined;
  const units: UnitVM[] = state.units.map((u) => {
    const side = sideOf(state, u.id);
    const combatant = u.kind === 'entity' || u.kind === 'enemy' ? u : null;
    return {
      id: u.id,
      kind: u.kind,
      name: unitName(u),
      initials: initialsOf(unitName(u)),
      r: u.r,
      c: u.c,
      altitude: u.altitude,
      color:
        u.kind === 'entity'
          ? u.sheet.color
          : u.kind === 'enemy'
            ? u.color
            : u.kind === 'terrain'
              ? u.color
              : u.item.color,
      side,
      hp: combatant ? health(combatant) : u.kind === 'terrain' ? u.health : 0,
      maxHp: combatant ? maxHealth(combatant) : u.kind === 'terrain' ? Math.max(1, u.health) : 1,
      showHpRing: combatant !== null,
      showHpNumbers: combatant !== null,
      ac: combatant ? armorClass(combatant) : u.kind === 'terrain' ? 10 : null,
      mob: combatant ? movement(combatant) : null,
      statuses:
        u.kind === 'entity'
          ? u.sheet.status.map((s) => s.name)
          : u.kind === 'enemy'
            ? u.statuses.map((s) => s.name)
            : [],
      selected: session.selectedId === u.id,
      active: current === u.id,
      inDarkness: lightLevelAt(lighting, u.r, u.c) === 'dark',
      terrain:
        u.kind === 'terrain'
          ? { collision: u.collision, entityAboveTerrain: u.entityAboveTerrain, spritePath: u.spritePath }
          : null,
      spritePath:
        u.kind === 'entity'
          ? u.sheet.spritePath
          : u.kind === 'enemy'
            ? u.spritePath
            : u.kind === 'terrain'
              ? u.spritePath
              : null,
    };
  });

  const lights: LightVM[] = state.board.lights.flatMap((l) => {
    const pos = lightPosition(state, l);
    if (!pos) return [];
    return [
      {
        id: l.id,
        name: l.name,
        r: pos.r,
        c: pos.c,
        on: isLightOn(state, l),
        color: l.color,
        brightRadius: l.brightRadius,
        dimRadius: l.dimRadius,
        attachedTo: l.attachedTo ?? null,
      },
    ];
  });

  const highlights = emptyHighlights();
  let banner: string | null = null;
  const placing = state.turn.placementQueue[0];
  if (placing !== undefined) {
    banner = `Place ${placing} - click a tile`;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) if (canUnitStand(state, r, c)) highlights.placement.push({ r, c });
  }
  const mode = session.mode;
  if (mode.kind === 'move') {
    const u = combatantById(state, mode.unitId);
    if (u) highlights.move = moveTargets(state, u);
  } else if (mode.kind === 'attack') {
    highlights.attack = attackTargets(state, mode.unitId).map((t) => t.id);
  } else if (mode.kind === 'cast') {
    const caster = combatantById(state, mode.unitId);
    const spell: SpellDef | undefined = assets.spells[mode.spellName];
    if (caster && spell) {
      if (isAreaSpell(spell)) {
        const aim = mode.lockedCells
          ? null
          : isSelfCenteredArea(spell)
            ? { r: caster.r, c: caster.c }
            : session.hover;
        const cellsCovered = mode.lockedCells ?? (aim ? areaCells(state, spell, caster, aim) : []);
        highlights.areaTemplate = cellsCovered;
        highlights.areaUnits = areaTargets(state, spell, caster, cellsCovered).map((t) => t.id);
      } else {
        const range = Math.max(1, spell.range);
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++)
            if (Math.abs(r - caster.r) + Math.abs(c - caster.c) <= range && isEnabled(state, r, c))
              highlights.castRange.push({ r, c });
        highlights.castTargets = spellTargets(state, caster.id, spell).map((t) => ({
          id: t.unit.id,
          inRange: t.inRange,
        }));
      }
    }
  }

  return {
    rows,
    cols,
    theme: state.board.theme,
    ambient: state.board.ambient,
    dmReveal: state.board.dmReveal,
    cells,
    units,
    lights,
    highlights,
    banner,
    phaseLabel: phaseLabel(state),
    strip: buildStrip(state),
    showStrip: true,
    view: 'dm',
    turnOrder: [...state.turn.order],
    started: state.turn.started,
    round: state.turn.round,
    pendingKind: state.pending?.kind ?? null,
  };
}

export const combatantCount = (state: BattleState): number => combatants(state).length;
