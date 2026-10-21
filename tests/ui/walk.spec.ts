import { describe, expect, it } from 'vitest';
import {
  MAX_WALK_STEPS,
  WALK_MAX_MS,
  WALK_STEP_MS,
  walkPath,
  walkPoint,
  walkStepMs,
} from '../../src/ui/renderer/three/walk.ts';

const key = (p: { r: number; c: number }) => `${p.r},${p.c}`;

describe('walking to a new tile', () => {
  it('takes one orthogonal step per tile the move costs, ending on the target', () => {
    for (const [a, b] of [
      [
        { r: 2, c: 2 },
        { r: 2, c: 7 },
      ],
      [
        { r: 5, c: 1 },
        { r: 1, c: 1 },
      ],
      [
        { r: 0, c: 0 },
        { r: 3, c: 4 },
      ],
      [
        { r: 6, c: 6 },
        { r: 2, c: 1 },
      ],
    ] as const) {
      const path = walkPath(a, b);
      expect(path[0]).toEqual(a);
      expect(path[path.length - 1]).toEqual(b);
      expect(path.length - 1).toBe(Math.abs(a.r - b.r) + Math.abs(a.c - b.c));
      for (let i = 1; i < path.length; i++) {
        const p = path[i - 1]!,
          q = path[i]!;
        expect(Math.abs(p.r - q.r) + Math.abs(p.c - q.c)).toBe(1);
      }
    }
  });

  it('stays near the straight line (alternating on a diagonal) instead of an L', () => {
    expect(walkPath({ r: 0, c: 0 }, { r: 2, c: 2 }).map(key)).toEqual(['0,0', '0,1', '1,1', '1,2', '2,2']);
    expect(walkPath({ r: 0, c: 0 }, { r: 1, c: 4 }).map(key)).toEqual([
      '0,0',
      '0,1',
      '0,2',
      '1,2',
      '1,3',
      '1,4',
    ]);
  });

  it('a tile per WALK_STEP_MS, sped up so long walks stay under WALK_MAX_MS', () => {
    expect(walkStepMs(3)).toBe(WALK_STEP_MS);
    expect(walkStepMs(MAX_WALK_STEPS) * MAX_WALK_STEPS).toBeLessThanOrEqual(WALK_MAX_MS);
  });

  it('moves from the first tile to the last, hopping each step and landing on the tile top', () => {
    const path = walkPath({ r: 0, c: 0 }, { r: 0, c: 3 });
    const tops = [0, 0, 0.75, 0.75]; // a ledge up between tiles 1 and 2
    const total = 3 * walkStepMs(3);
    expect(walkPoint(path, tops, 0)).toMatchObject({ x: 0.5, z: 0.5, y: 0, done: false });
    const mid = walkPoint(path, tops, total / 2);
    expect(mid.x).toBeCloseTo(2, 5); // halfway along the middle step
    expect(mid.y).toBeGreaterThan(0.75 / 2); // climbing hops higher than the ledge's midpoint
    expect(walkPoint(path, tops, total)).toEqual({ x: 3.5, y: 0.75, z: 0.5, done: true });
    let last = -Infinity;
    for (let t = 0; t <= total; t += 10) {
      const x = walkPoint(path, tops, t).x;
      expect(x).toBeGreaterThanOrEqual(last);
      last = x;
    }
  });
});
