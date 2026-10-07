/**
 * Seeded randomness. Every random choice in the engine and generators goes through an `Rng`
 * so puzzles are reproducible from their seed. Never use Math.random() in engine code.
 */

/** Returns floats in [0, 1). */
export type Rng = () => number;

/** mulberry32: tiny, fast, good enough for puzzle generation. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, n). */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** Integer in [lo, hi] inclusive. */
export function randRange(rng: Rng, lo: number, hi: number): number {
  return lo + randInt(rng, hi - lo + 1);
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error("pick from empty array");
  return arr[randInt(rng, arr.length)]!;
}

/** Fisher–Yates, in place. Returns the same array for chaining. */
export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
  return arr;
}

/** Weighted choice: weights need not sum to 1. */
export function pickWeighted<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (const w of weights) total += w;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** Stable 32-bit hash of strings/numbers (FNV-1a), for deriving seeds from ids or dates. */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x7c; // separator so ("ab","c") != ("a","bc")
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
