/**
 * Visual-only light levels per cell (bright / dim / dark). Not consulted by any
 * rule. Walls (terrain with blocksLight) and terrain higher than both the light
 * and the target block light; distance is Euclidean between tile centres.
 */
import type { BattleState, Cell, Light, LightLevel, UnitId } from '../types.ts';
import { elevationAt, inBounds, isEnabled, unitById } from './board.ts';

/** Where SET_AMBIENT's three steps sit on the 0–100 ambient slider. */
export const AMBIENT_PRESET: Record<LightLevel, number> = { bright: 100, dim: 35, dark: 0 };

/** The bright / dim / dark band of a 0–100 ambient level (what the rules and the player view use). */
export function ambientBand(level: number): LightLevel {
  return level >= 67 ? 'bright' : level >= 20 ? 'dim' : 'dark';
}

/** The board's 0–100 ambient level; saves from before the slider derive it from the band. */
export const ambientLevelOf = (board: { ambient: LightLevel; ambientLevel?: number }): number =>
  board.ambientLevel ?? AMBIENT_PRESET[board.ambient];

export interface CellLight {
  level: LightLevel;
  sources: { id: string; color: string; strength: number }[];
}

export function isLightOn(state: BattleState, light: Light): boolean {
  if (!light.on) return false;
  if (light.groupId) {
    const g = state.board.lightGroups.find((x) => x.id === light.groupId);
    if (g && !g.on) return false;
  }
  if (light.attachedTo && !unitById(state, light.attachedTo)) return false;
  return true;
}

export function lightPosition(state: BattleState, light: Light): (Cell & { elev: number }) | null {
  if (light.at) return { ...light.at, elev: elevationAt(state, light.at.r, light.at.c) + 1 };
  if (light.attachedTo) {
    const u = unitById(state, light.attachedTo);
    if (!u) return null;
    return { r: u.r, c: u.c, elev: elevationAt(state, u.r, u.c) + u.altitude + 1 };
  }
  return null;
}

function blocksLightAt(state: BattleState, r: number, c: number): boolean {
  for (const u of state.units)
    if (u.kind === 'terrain' && u.blocksLight && u.health > 0 && u.r === r && u.c === c) return true;
  return false;
}

/** Cells crossed between two tile centres (excluding both ends). */
export function cellsBetween(r0: number, c0: number, r1: number, c1: number): Cell[] {
  const out: Cell[] = [];
  const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0)) * 2;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const r = Math.round(r0 + (r1 - r0) * t);
    const c = Math.round(c0 + (c1 - c0) * t);
    if ((r === r0 && c === c0) || (r === r1 && c === c1)) continue;
    if (!out.some((p) => p.r === r && p.c === c)) out.push({ r, c });
  }
  return out;
}

export function hasLineOfLight(
  state: BattleState,
  from: Cell & { elev: number },
  r: number,
  c: number,
): boolean {
  const targetElev = elevationAt(state, r, c);
  for (const p of cellsBetween(from.r, from.c, r, c)) {
    if (blocksLightAt(state, p.r, p.c)) return false;
    const e = elevationAt(state, p.r, p.c);
    if (e > from.elev - 1 && e > targetElev) return false;
  }
  return true;
}

/** Light level for every cell, keyed "r,c". Ambient sets the floor level. */
export function computeLighting(state: BattleState): Map<string, CellLight> {
  const map = new Map<string, CellLight>();
  const { rows, cols, ambient } = state.board;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) map.set(`${r},${c}`, { level: ambient, sources: [] });
  const rank: Record<LightLevel, number> = { dark: 0, dim: 1, bright: 2 };
  for (const light of state.board.lights) {
    if (!isLightOn(state, light)) continue;
    const src = lightPosition(state, light);
    if (!src) continue;
    const reach = Math.max(light.brightRadius, light.dimRadius);
    for (
      let r = Math.max(0, Math.floor(src.r - reach));
      r <= Math.min(rows - 1, Math.ceil(src.r + reach));
      r++
    ) {
      for (
        let c = Math.max(0, Math.floor(src.c - reach));
        c <= Math.min(cols - 1, Math.ceil(src.c + reach));
        c++
      ) {
        const d = Math.hypot(r - src.r, c - src.c);
        if (d > reach + 0.01) continue;
        if (blocksLightAt(state, r, c)) continue;
        if (!hasLineOfLight(state, src, r, c)) continue;
        const cell = map.get(`${r},${c}`);
        if (!cell) continue;
        const level: LightLevel = d <= light.brightRadius + 0.01 ? 'bright' : 'dim';
        if (rank[level] > rank[cell.level]) cell.level = level;
        cell.sources.push({
          id: light.id,
          color: light.color,
          strength:
            level === 'bright' ? 1 - d / (reach + 1) : 0.45 - (d - light.brightRadius) / (reach * 2.5),
        });
      }
    }
  }
  return map;
}

export function lightLevelAt(lighting: Map<string, CellLight>, r: number, c: number): LightLevel {
  return lighting.get(`${r},${c}`)?.level ?? 'dark';
}

/** Units standing (or flying) on a dark cell: hidden from the player view. */
export function unitsInDarkness(state: BattleState, lighting = computeLighting(state)): Set<UnitId> {
  const out = new Set<UnitId>();
  for (const u of state.units) {
    if (!inBounds(state, u.r, u.c) || !isEnabled(state, u.r, u.c)) continue;
    if (lightLevelAt(lighting, u.r, u.c) === 'dark') out.add(u.id);
  }
  return out;
}
