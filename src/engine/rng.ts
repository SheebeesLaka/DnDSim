/**
 * All randomness in the engine goes through an injected Rng so tests are
 * deterministic and the app can plug in crypto randomness.
 */
export interface Rng {
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** Uniform float in [0, 1). */
  float(): number;
}

/** mulberry32: small, fast, good enough for dice; seed is any 32-bit integer. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    float: next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
  };
}

/** Fisher–Yates with the given rng (java.util.Collections.shuffle's algorithm shape). */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

export const d20 = (rng: Rng): number => rng.int(1, 20);
