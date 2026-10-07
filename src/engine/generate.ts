/**
 * Puzzle generation primitives (pure, seeded). Difficulty targeting lives in `grade.ts`/`pack.ts`;
 * this file makes valid, unique puzzles:
 *
 * - `randomSolvedGrid`: randomized backtracking fill.
 * - `digClassic`: remove givens (180° symmetric pairs by default) while the solution stays unique.
 * - `partitionCages` + `makeKillerUnique`: grow cages over a solved grid (no repeated digit inside a
 *   cage), then split cages until the exact solver finds exactly one solution.
 */
import { ALL_DIGITS, digitsOf } from "./combos";
import { boxOf, colOf, rowOf } from "./geometry";
import { exactSolve } from "./exact";
import { pickWeighted, randInt, shuffle, type Rng } from "./rng";
import type { Cage, CellId, Grid, Puzzle } from "./types";

export function randomSolvedGrid(rng: Rng): Grid {
  const g = new Uint8Array(81);
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  const fill = (): boolean => {
    let best = -1;
    let bestMask = 0;
    let bestCnt = 10;
    for (let c = 0; c < 81; c++) {
      if (g[c]) continue;
      const m = ALL_DIGITS & ~(rows[rowOf(c)]! | cols[colOf(c)]! | boxes[boxOf(c)]!);
      const cnt = digitsOf(m).length;
      if (cnt === 0) return false;
      if (cnt < bestCnt) {
        best = c;
        bestMask = m;
        bestCnt = cnt;
      }
    }
    if (best === -1) return true;
    const r = rowOf(best);
    const col = colOf(best);
    const b = boxOf(best);
    for (const d of shuffle(rng, digitsOf(bestMask))) {
      const bit = 1 << d;
      g[best] = d;
      rows[r]! |= bit;
      cols[col]! |= bit;
      boxes[b]! |= bit;
      if (fill()) return true;
      rows[r]! &= ~bit;
      cols[col]! &= ~bit;
      boxes[b]! &= ~bit;
      g[best] = 0;
    }
    return false;
  };
  if (!fill()) throw new Error("randomSolvedGrid: fill failed");
  return g;
}

const EMPTY_CLASSIC: Puzzle = { id: "", kind: "classic", cages: [] };

export interface DigOptions {
  /** Never go below this many givens. */
  minGivens: number;
  /** Remove cells in 180°-symmetric pairs (default true). */
  symmetric?: boolean;
}

/** Returns a givens grid (0 = blank) whose only solution is `solution`. */
export function digClassic(solution: Grid, rng: Rng, opts: DigOptions): Grid {
  const givens = Uint8Array.from(solution);
  const symmetric = opts.symmetric ?? true;
  const order: CellId[][] = [];
  if (symmetric) {
    for (let c = 0; c <= 40; c++) order.push(c === 40 ? [40] : [c, 80 - c]);
  } else for (let c = 0; c < 81; c++) order.push([c]);
  shuffle(rng, order);
  let count = 81;
  for (const group of order) {
    if (count - group.length < opts.minGivens) continue;
    const saved = group.map((c) => givens[c]!);
    for (const c of group) givens[c] = 0;
    if (exactSolve(EMPTY_CLASSIC, { grid: givens, limit: 2 }).count === 1) count -= group.length;
    else group.forEach((c, i) => (givens[c] = saved[i]!));
  }
  return givens;
}

export function givensRecord(g: Grid): Record<number, number> {
  const out: Record<number, number> = {};
  for (let c = 0; c < 81; c++) if (g[c]) out[c] = g[c]!;
  return out;
}

const NEIGHBORS: CellId[][] = Array.from({ length: 81 }, (_, c) => {
  const r = rowOf(c);
  const k = colOf(c);
  const out: CellId[] = [];
  if (r > 0) out.push(c - 9);
  if (r < 8) out.push(c + 9);
  if (k > 0) out.push(c - 1);
  if (k < 8) out.push(c + 1);
  return out;
});

export interface PartitionOptions {
  /** sizeWeights[s] = relative chance of aiming for an s-cell cage. Index 0 unused. */
  sizeWeights: number[];
  /** Hard cap on cage size. */
  maxSize: number;
  /** 0..1: how strongly growth prefers compact shapes over snakes. */
  compactness?: number;
}

/** Grow cages over a solved grid. No cage repeats a digit. Returns lists of cells. */
export function partitionCages(solution: Grid, rng: Rng, opts: PartitionOptions): CellId[][] {
  const owner = new Int16Array(81).fill(-1);
  const cages: CellId[][] = [];
  const sizes = opts.sizeWeights.map((_, i) => i);
  const compact = opts.compactness ?? 0.6;

  for (const start of shuffle(rng, Array.from({ length: 81 }, (_, i) => i))) {
    if (owner[start] !== -1) continue;
    const id = cages.length;
    const cells = [start];
    owner[start] = id;
    let digits = 1 << solution[start]!;
    const target = Math.min(opts.maxSize, pickWeighted(rng, sizes, opts.sizeWeights));
    while (cells.length < target) {
      const frontier: CellId[] = [];
      const weights: number[] = [];
      for (const c of cells)
        for (const n of NEIGHBORS[c]!) {
          if (owner[n] !== -1 || digits & (1 << solution[n]!) || frontier.includes(n)) continue;
          const touching = NEIGHBORS[n]!.filter((x) => owner[x] === id).length;
          frontier.push(n);
          weights.push(1 + compact * 3 * (touching - 1));
        }
      if (!frontier.length) break;
      const next = pickWeighted(rng, frontier, weights);
      cells.push(next);
      owner[next] = id;
      digits |= 1 << solution[next]!;
    }
    cages.push(cells);
  }

  // Fold single-cell cages into a neighbour when the digit fits; a few singles may remain.
  for (let id = 0; id < cages.length; id++) {
    const cells = cages[id]!;
    if (cells.length !== 1) continue;
    const c = cells[0]!;
    const options = shuffle(
      rng,
      NEIGHBORS[c]!.map((n) => owner[n]!).filter((o, i, a) => a.indexOf(o) === i && o !== id),
    );
    for (const o of options) {
      const other = cages[o]!;
      if (other.length >= opts.maxSize) continue;
      if (other.some((x) => solution[x] === solution[c])) continue;
      other.push(c);
      owner[c] = o;
      cages[id] = [];
      break;
    }
  }
  return cages.filter((cells) => cells.length > 0).map((cells) => cells.sort((a, b) => a - b));
}

export function cagesFromCells(cellLists: CellId[][], solution: Grid): Cage[] {
  return cellLists.map((cells, id) => ({
    id,
    cells: [...cells].sort((a, b) => a - b),
    sum: cells.reduce((s, c) => s + solution[c]!, 0),
  }));
}

function isConnected(cells: readonly CellId[]): boolean {
  if (cells.length <= 1) return true;
  const set = new Set(cells);
  const seen = new Set([cells[0]!]);
  const stack = [cells[0]!];
  while (stack.length) {
    const c = stack.pop()!;
    for (const n of NEIGHBORS[c]!)
      if (set.has(n) && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
  }
  return seen.size === cells.length;
}

/** All ways to split a cage into two connected, non-empty parts (each split listed once). */
export function connectedSplits(cells: readonly CellId[]): [CellId[], CellId[]][] {
  const n = cells.length;
  const out: [CellId[], CellId[]][] = [];
  // Fix cells[0] in part A to list each split once.
  for (let mask = 1; mask < 1 << n; mask += 2) {
    if (mask === (1 << n) - 1) continue;
    const a: CellId[] = [];
    const b: CellId[] = [];
    cells.forEach((c, i) => (mask & (1 << i) ? a : b).push(c));
    if (isConnected(a) && isConnected(b)) out.push([a, b]);
  }
  return out;
}

export interface KillerRepairOptions {
  maxRepairs?: number;
  maxNodes?: number;
  /** When no split helps, allow adding a given digit at a cell where solutions differ. */
  allowGivens?: boolean;
}

/**
 * Split cages (and, if allowed, add givens) until the puzzle has exactly one solution.
 * Returns null when it gives up or the solver aborts (layout too loose to check quickly).
 */
export function makeKillerUnique(
  cellLists: CellId[][],
  solution: Grid,
  rng: Rng,
  opts: KillerRepairOptions = {},
): { cages: Cage[]; givens: Record<number, number> } | null {
  const lists = cellLists.map((l) => [...l]);
  const givens: Record<number, number> = {};
  const maxRepairs = opts.maxRepairs ?? 24;
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const cages = cagesFromCells(lists, solution);
    const res = exactSolve({ id: "", kind: "killer", cages, givens }, { limit: 2, maxNodes: opts.maxNodes ?? 400_000 });
    if (res.aborted || res.count === 0) return null;
    if (res.count === 1) return { cages, givens };
    const alt = sameGrid(res.solution!, solution) ? res.second! : res.solution!;
    const diff: CellId[] = [];
    for (let c = 0; c < 81; c++) if (alt[c] !== solution[c]) diff.push(c);

    // Prefer splitting a cage so that the alternative solution breaks one of the new sums.
    const candidates: { index: number; split: [CellId[], CellId[]] }[] = [];
    lists.forEach((cells, index) => {
      if (cells.length < 2 || !cells.some((c) => diff.includes(c))) return;
      for (const split of connectedSplits(cells)) {
        const [a] = split;
        const sumSol = a.reduce((s, c) => s + solution[c]!, 0);
        const sumAlt = a.reduce((s, c) => s + alt[c]!, 0);
        if (sumSol !== sumAlt) candidates.push({ index, split });
      }
    });
    if (candidates.length) {
      // Bias towards splits that keep pieces at least 2 cells (single-cell cages give digits away).
      const weights = candidates.map(({ split: [a, b] }) => (a.length > 1 && b.length > 1 ? 4 : 1));
      const choice = pickWeighted(rng, candidates, weights);
      lists[choice.index] = choice.split[0];
      lists.push(choice.split[1]);
      continue;
    }
    if (!opts.allowGivens) return null;
    const c = diff[randInt(rng, diff.length)]!;
    givens[c] = solution[c]!;
  }
  return null;
}

function sameGrid(a: Grid, b: Grid): boolean {
  for (let i = 0; i < 81; i++) if (a[i] !== b[i]) return false;
  return true;
}
