/**
 * Height-region labelling for the board overlay: contiguous cells of equal
 * non-zero elevation get one "+10 ft" chip, and contiguous ramps of the same
 * slope get one "ramp +5 → 0 ft" chip. Pure, so it is unit-tested.
 */
import type { Cell } from '../../../engine/types.ts';
import type { CellVM } from '../../../engine/view/boardViewModel.ts';

export interface HeightRegion {
  kind: 'level' | 'ramp';
  elevation: number;
  /** ramps only */
  from?: number;
  to?: number;
  cells: Cell[];
  /** where the chip goes: the least-covered cell, north-west-most on ties */
  label: Cell;
  /** how covered that cell is (see labelCellCosts); 1 = an HP label spills into its back edge */
  labelCost: number;
}

const key = (r: number, c: number) => `${r},${c}`;

export function heightRegions(cells: CellVM[][], labelCost: ReadonlyMap<string, number>): HeightRegion[] {
  const rows = cells.length;
  const seen = new Set<string>();
  const out: HeightRegion[] = [];
  const at = (r: number, c: number): CellVM | undefined => cells[r]?.[c];
  const sameGroup = (a: CellVM, b: CellVM): boolean => {
    if (!b.enabled) return false;
    if (a.ramp || b.ramp) {
      return (
        Boolean(a.ramp && b.ramp) &&
        a.ramp?.from === b.ramp?.from &&
        a.ramp?.to === b.ramp?.to &&
        a.ramp?.dir === b.ramp?.dir
      );
    }
    return a.elevation === b.elevation;
  };
  for (let r = 0; r < rows; r++) {
    const row = cells[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const start = row[c];
      if (!start || !start.enabled || seen.has(key(r, c))) continue;
      if (!start.ramp && start.elevation === 0) continue;
      const group: Cell[] = [];
      const queue: Cell[] = [{ r, c }];
      seen.add(key(r, c));
      while (queue.length > 0) {
        const cur = queue.shift() as Cell;
        group.push(cur);
        for (const [dr, dc] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nr = cur.r + dr,
            nc = cur.c + dc;
          const n = at(nr, nc);
          if (!n || seen.has(key(nr, nc)) || !sameGroup(start, n)) continue;
          seen.add(key(nr, nc));
          queue.push({ r: nr, c: nc });
        }
      }
      group.sort((a, b) => a.r - b.r || a.c - b.c);
      // least-covered cell wins; ties go to the north-west-most (group is sorted)
      let label: Cell = group[0] ?? { r, c };
      let best = Infinity;
      for (const g of group) {
        const cost = labelCost.get(key(g.r, g.c)) ?? 0;
        if (cost < best) {
          best = cost;
          label = g;
        }
      }
      out.push(
        start.ramp
          ? {
              kind: 'ramp',
              elevation: start.elevation,
              from: start.ramp.from,
              to: start.ramp.to,
              cells: group,
              label,
              labelCost: best,
            }
          : { kind: 'level', elevation: start.elevation, cells: group, label, labelCost: best },
      );
    }
  }
  return out;
}

export const occupiedCells = (units: readonly { r: number; c: number }[]): Set<string> =>
  new Set(units.map((u) => key(u.r, u.c)));

/**
 * Neighbour offsets a unit's screen footprint spills into one cell along a
 * ground direction (x = columns, z = rows): the cell straight along it, plus
 * the side neighbour when the direction runs diagonal to the grid.
 */
export function cellsAlong(dir: { x: number; z: number }): { dr: number; dc: number }[] {
  const len = Math.hypot(dir.x, dir.z) || 1;
  const fx = dir.x / len,
    fz = dir.z / len;
  const out: { dr: number; dc: number }[] = [];
  for (const side of [-0.3, 0, 0.3]) {
    const dc = Math.round(fx * 0.9 - fz * side) + 0, // + 0 turns -0 into 0
      dr = Math.round(fz * 0.9 + fx * side) + 0;
    if ((dc !== 0 || dr !== 0) && !out.some((o) => o.dr === dr && o.dc === dc)) out.push({ dr, dc });
  }
  return out;
}

/**
 * How badly a height chip would collide with something in each cell: 3 = a
 * unit stands there, 2 = an upright sprite in front of it covers it (tactical
 * view), 1 = a unit's HP label below its rings spills into it. Missing = free.
 * `toward` is the ground direction toward the camera (screen-down); default
 * is a camera in the south.
 */
export function labelCellCosts(
  units: readonly { r: number; c: number; kind: string }[],
  upright: boolean,
  toward: { x: number; z: number } = { x: 0, z: 1 },
): Map<string, number> {
  const out = new Map<string, number>();
  const bump = (r: number, c: number, cost: number) =>
    out.set(key(r, c), Math.max(out.get(key(r, c)) ?? 0, cost));
  const behind = cellsAlong({ x: -toward.x, z: -toward.z });
  const below = cellsAlong(toward);
  for (const u of units) {
    bump(u.r, u.c, 3);
    if (u.kind !== 'entity' && u.kind !== 'enemy') continue;
    if (upright) for (const o of behind) bump(u.r + o.dr, u.c + o.dc, 2);
    for (const o of below) bump(u.r + o.dr, u.c + o.dc, 1);
  }
  return out;
}
