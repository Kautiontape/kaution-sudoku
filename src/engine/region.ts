/**
 * The 45 rule. Any set of whole rows, columns or boxes (a "region") sums to 45 × houses.
 * Cages entirely inside the region account for part of that; what's left over is carried by:
 *   innies — region cells belonging to cages that stick out of the region, and
 *   outies — the parts of those same cages that lie outside the region.
 *
 *   Σ innies = 45n − Σ(cages inside)
 *   Σ outies = Σ(cages sticking out) − Σ innies
 *
 * Shared by the innies/outies technique and the calculator's Region mode, so the hint and the
 * calculator can never disagree.
 */
import { houseCells } from "./geometry";
import type { Cage, CellId, House } from "./types";

export interface PartialCage {
  cage: Cage;
  inCells: CellId[];
  outCells: CellId[];
}

export interface RegionAnalysis {
  houses: House[];
  cells: CellId[];
  total: number;
  inside: Cage[];
  insideSum: number;
  partial: PartialCage[];
  innies: CellId[];
  outies: CellId[];
  innieSum: number;
  outieSum: number;
}

export function analyzeRegion(cages: readonly Cage[], houses: readonly House[]): RegionAnalysis {
  const set = new Set<CellId>();
  for (const h of houses)
    for (const c of houseCells(h)) {
      if (set.has(c)) throw new Error("analyzeRegion: houses overlap");
      set.add(c);
    }
  const inside: Cage[] = [];
  const partial: PartialCage[] = [];
  for (const cage of cages) {
    if (cage.virtual) continue;
    const inCells = cage.cells.filter((c) => set.has(c));
    if (!inCells.length) continue;
    if (inCells.length === cage.cells.length) inside.push(cage);
    else partial.push({ cage, inCells, outCells: cage.cells.filter((c) => !set.has(c)) });
  }
  const total = 45 * houses.length;
  const insideSum = inside.reduce((a, c) => a + c.sum, 0);
  const partialSum = partial.reduce((a, p) => a + p.cage.sum, 0);
  const innieSum = total - insideSum;
  return {
    houses: [...houses],
    cells: [...set].sort((a, b) => a - b),
    total,
    inside,
    insideSum,
    partial,
    innies: partial.flatMap((p) => p.inCells).sort((a, b) => a - b),
    outies: partial.flatMap((p) => p.outCells).sort((a, b) => a - b),
    innieSum,
    outieSum: partialSum - innieSum,
  };
}

function runs(kind: "row" | "col", length: number): House[][] {
  const out: House[][] = [];
  for (let start = 0; start + length <= 9; start++)
    out.push(Array.from({ length }, (_, i) => ({ kind, index: start + i })));
  return out;
}

const box = (index: number): House => ({ kind: "box", index });

/** Single houses: rows, columns, boxes. */
export const SINGLE_REGIONS: House[][] = [
  ...runs("row", 1),
  ...runs("col", 1),
  ...Array.from({ length: 9 }, (_, i) => [box(i)]),
];

/** Multi-house regions people actually use: 2–4 adjacent rows/columns, adjacent box pairs, 2×2 boxes. */
export const MULTI_REGIONS: House[][] = [
  ...runs("row", 2),
  ...runs("col", 2),
  // Adjacent box pairs, horizontally and vertically.
  ...[0, 1, 3, 4, 6, 7].map((b) => [box(b), box(b + 1)]),
  ...[0, 1, 2, 3, 4, 5].map((b) => [box(b), box(b + 3)]),
  ...runs("row", 3),
  ...runs("col", 3),
  ...[0, 1, 3, 4].map((b) => [box(b), box(b + 1), box(b + 3), box(b + 4)]),
  ...runs("row", 4),
  ...runs("col", 4),
];

export interface RegionEquation {
  analysis: RegionAnalysis;
  side: "innies" | "outies";
  /** Empty cells on the chosen side. */
  empty: CellId[];
  /** Digits already placed on the chosen side. */
  placed: { cell: CellId; digit: number }[];
  /** What the empty cells add up to. */
  target: number;
}

/**
 * The more readable side of the 45 rule for the current board: whichever of innies / outies has
 * fewer empty cells (innies on a tie; a side with nothing left open is skipped). Null when every
 * cage fits inside the region.
 */
export function regionEquation(cages: readonly Cage[], grid: ArrayLike<number>, houses: readonly House[]): RegionEquation | null {
  const analysis = analyzeRegion(cages, houses);
  if (!analysis.innies.length) return null;
  const side = (name: "innies" | "outies"): RegionEquation => {
    const cells = name === "innies" ? analysis.innies : analysis.outies;
    const sum = name === "innies" ? analysis.innieSum : analysis.outieSum;
    const empty = cells.filter((c) => !grid[c]);
    const placed = cells.filter((c) => grid[c]).map((c) => ({ cell: c, digit: grid[c]! }));
    return { analysis, side: name, empty, placed, target: sum - placed.reduce((a, p) => a + p.digit, 0) };
  };
  const inn = side("innies");
  const out = side("outies");
  // Prefer the side with the fewest open cells, ignoring a side that's already complete.
  if (!inn.empty.length) return out.empty.length ? out : inn;
  return out.empty.length && out.empty.length < inn.empty.length ? out : inn;
}

const cache = new WeakMap<readonly Cage[], Map<string, RegionAnalysis>>();

/** Memoized per cage list (cages are static during a game). */
export function analyzeRegionCached(cages: readonly Cage[], houses: readonly House[]): RegionAnalysis {
  let m = cache.get(cages);
  if (!m) cache.set(cages, (m = new Map()));
  const key = houses.map((h) => h.kind[0]! + h.index).join(",");
  let r = m.get(key);
  if (!r) m.set(key, (r = analyzeRegion(cages, houses)));
  return r;
}
