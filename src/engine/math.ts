/** Integer helpers that make Java's two division semantics explicit (FEATURES.md conventions). */

/** Java `int / int`: truncates toward zero. */
export function truncDiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

/** Java `Math.floorDiv`. */
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function manhattan(r0: number, c0: number, r1: number, c1: number): number {
  return Math.abs(r0 - r1) + Math.abs(c0 - c1);
}

export function chebyshev(r0: number, c0: number, r1: number, c1: number): number {
  return Math.max(Math.abs(r0 - r1), Math.abs(c0 - c1));
}

/** Java `Math.signum` for ints. */
export function signum(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/** Java `Math.round` (half up) for doubles, as used by SpellArea's line walker. */
export function javaRound(v: number): number {
  return Math.floor(v + 0.5);
}
