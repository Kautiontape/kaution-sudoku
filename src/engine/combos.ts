import type { Digit } from "./types";

/** Bitmask helpers: bit d (1..9) = digit d. */
export const ALL_DIGITS = 0b1111111110;
export const bit = (d: Digit): number => 1 << d;
export const has = (mask: number, d: Digit): boolean => (mask & (1 << d)) !== 0;
export function digitsOf(mask: number): Digit[] {
  const out: Digit[] = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << d)) out.push(d);
  return out;
}
export function maskOf(digits: Iterable<Digit>): number {
  let m = 0;
  for (const d of digits) m |= 1 << d;
  return m;
}
export function popcount(mask: number): number {
  let n = 0;
  while (mask) {
    mask &= mask - 1;
    n++;
  }
  return n;
}

/** Precomputed: COMBOS[size][sum] = list of masks of `size` distinct digits summing to `sum`. */
const COMBOS: number[][][] = Array.from({ length: 10 }, () => Array.from({ length: 46 }, () => []));
for (let m = 0; m < 1 << 9; m++) {
  const mask = m << 1;
  const ds = digitsOf(mask);
  const sum = ds.reduce((a, b) => a + b, 0);
  COMBOS[ds.length]![sum]!.push(mask);
}

/** All combos (as masks) of `size` distinct digits summing to `sum`. */
export function cageCombos(size: number, sum: number): number[] {
  if (size < 1 || size > 9 || sum < 0 || sum > 45) return [];
  return COMBOS[size]![sum]!;
}

export interface ComboFilter {
  /** Digits that must appear (e.g. already placed in the cage). */
  include?: number;
  /** Digits that cannot appear (e.g. eliminated from every cell of the cage). */
  exclude?: number;
}

/** Combos consistent with required and forbidden digits. */
export function filteredCombos(size: number, sum: number, f: ComboFilter = {}): number[] {
  const inc = f.include ?? 0;
  const exc = f.exclude ?? 0;
  return cageCombos(size, sum).filter((m) => (m & inc) === inc && (m & exc) === 0);
}

/** Digits present in every listed combo (must-contain) and in at least one (can-contain). */
export function comboSummary(combos: number[]): { must: number; can: number } {
  let must = ALL_DIGITS;
  let can = 0;
  for (const m of combos) {
    must &= m;
    can |= m;
  }
  return { must: combos.length ? must : 0, can };
}

export function minSum(size: number): number {
  return (size * (size + 1)) / 2;
}
export function maxSum(size: number): number {
  return (size * (19 - size)) / 2;
}
