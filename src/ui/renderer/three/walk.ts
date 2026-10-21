/**
 * A unit that moves walks there tile by tile instead of jumping. Visual only:
 * the engine has already put it on the new tile. The path is the straight
 * line between the tiles in orthogonal steps (as many as the move costs);
 * it does not route around walls or creatures.
 */
import type { Cell } from '../../../engine/types.ts';

/** Longest walk animated; anything farther (a reshape, a long undo) just jumps. */
export const MAX_WALK_STEPS = 24;
/** Time per tile, shortened so a long walk still finishes within WALK_MAX_MS. */
export const WALK_STEP_MS = 130;
export const WALK_MAX_MS = 900;
/** Height of the little hop each step makes (world units), plus extra per unit climbed or dropped. */
const HOP = 0.06;
const HOP_PER_RISE = 0.45;

/** Orthogonal steps from `a` to `b` that stay closest to the straight line (both ends included). */
export function walkPath(a: Cell, b: Cell): Cell[] {
  const dr = Math.abs(b.r - a.r),
    dc = Math.abs(b.c - a.c);
  const sr = Math.sign(b.r - a.r),
    sc = Math.sign(b.c - a.c);
  const path: Cell[] = [{ r: a.r, c: a.c }];
  let r = a.r,
    c = a.c,
    ir = 0,
    ic = 0;
  while (ir < dr || ic < dc) {
    // step along whichever axis is further behind the line (column first on a tie)
    if ((1 + 2 * ic) * dr <= (1 + 2 * ir) * dc) {
      c += sc;
      ic++;
    } else {
      r += sr;
      ir++;
    }
    path.push({ r, c });
  }
  return path;
}

export const walkStepMs = (steps: number): number => Math.min(WALK_STEP_MS, WALK_MAX_MS / Math.max(1, steps));

const easeInOut = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * t);

/**
 * Where a walker's feet are `elapsed` ms into the walk: tile centres in world
 * x/z, `y` from the tile tops (`tops[i]` for `path[i]`) with a hop per step.
 */
export function walkPoint(
  path: readonly Cell[],
  tops: readonly number[],
  elapsed: number,
): { x: number; y: number; z: number; done: boolean } {
  const steps = path.length - 1;
  const last = path[steps] ?? { r: 0, c: 0 };
  const total = steps * walkStepMs(steps);
  if (steps <= 0 || elapsed >= total)
    return { x: last.c + 0.5, y: tops[steps] ?? 0, z: last.r + 0.5, done: true };
  const p = easeInOut(Math.max(0, elapsed) / total) * steps;
  const i = Math.min(steps - 1, Math.floor(p));
  const f = p - i;
  const a = path[i] ?? last,
    b = path[i + 1] ?? last;
  const ya = tops[i] ?? 0,
    yb = tops[i + 1] ?? 0;
  return {
    x: a.c + 0.5 + (b.c - a.c) * f,
    z: a.r + 0.5 + (b.r - a.r) * f,
    y: ya + (yb - ya) * f + (HOP + HOP_PER_RISE * Math.abs(yb - ya)) * Math.sin(Math.PI * f),
    done: false,
  };
}
