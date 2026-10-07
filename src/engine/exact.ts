/**
 * Exact solver for classic and killer sudoku: bitmask backtracking with minimum-remaining-values
 * cell choice, hidden-single forcing, and cage pruning (a cell may only take digits that appear in
 * some combination completing its cage). Used for uniqueness checks in the generator and for
 * validation — never for hints.
 */
import { ALL_DIGITS, cageCombos } from "./combos";
import { boxOf, colOf, HOUSE_CELLS, rowOf } from "./geometry";
import { cageIndexMap, gridFromPuzzle } from "./candidates";
import type { Grid, Puzzle } from "./types";

const ROW = Uint8Array.from({ length: 81 }, (_, c) => rowOf(c));
const COL = Uint8Array.from({ length: 81 }, (_, c) => colOf(c));
const BOX = Uint8Array.from({ length: 81 }, (_, c) => boxOf(c));
const POP = Uint8Array.from({ length: 1024 }, (_, m) => {
  let n = 0;
  for (let x = m; x; x &= x - 1) n++;
  return n;
});

export interface ExactOptions {
  /** Stop after this many solutions (default 2: enough to decide uniqueness). */
  limit?: number;
  /** Abort after this many search nodes; result then has `aborted: true`. */
  maxNodes?: number;
  /** Start from this grid instead of the puzzle's givens. */
  grid?: Grid;
}

export interface ExactResult {
  count: number;
  /** First solution found, if any. */
  solution: Grid | null;
  /** Second solution found, if any (useful to see where solutions differ). */
  second: Grid | null;
  nodes: number;
  aborted: boolean;
}

export function exactSolve(p: Puzzle, opts: ExactOptions = {}): ExactResult {
  const limit = opts.limit ?? 2;
  const maxNodes = opts.maxNodes ?? Infinity;
  const grid = opts.grid ? Uint8Array.from(opts.grid) : gridFromPuzzle(p);
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  const cages = p.cages;
  const cageOf = cageIndexMap(cages);
  const cageUsed = new Uint16Array(cages.length);
  const cageRem = new Int16Array(cages.length);
  const cageLeft = new Uint8Array(cages.length);
  cages.forEach((cage, k) => {
    cageRem[k] = cage.sum;
    cageLeft[k] = cage.cells.length;
  });

  const result: ExactResult = { count: 0, solution: null, second: null, nodes: 0, aborted: false };

  // Load existing digits; a clash means no solutions.
  for (let c = 0; c < 81; c++) {
    const d = grid[c]!;
    if (!d) continue;
    const b = 1 << d;
    const k = cageOf[c]!;
    if ((rows[ROW[c]!]! | cols[COL[c]!]! | boxes[BOX[c]!]!) & b) return result;
    if (k >= 0 && cageUsed[k]! & b) return result;
    rows[ROW[c]!]! |= b;
    cols[COL[c]!]! |= b;
    boxes[BOX[c]!]! |= b;
    if (k >= 0) {
      cageUsed[k]! |= b;
      cageRem[k]! -= d;
      cageLeft[k]!--;
    }
  }
  for (let k = 0; k < cages.length; k++) {
    if (cageLeft[k] === 0 && cageRem[k] !== 0) return result;
    if (cageRem[k]! < 0) return result;
  }

  const cageAllowed = new Uint16Array(cages.length);
  const computeCageAllowed = (): boolean => {
    for (let k = 0; k < cages.length; k++) {
      if (cageLeft[k] === 0) {
        cageAllowed[k] = 0;
        continue;
      }
      let allowed = 0;
      for (const combo of cageCombos(cageLeft[k]!, cageRem[k]!)) if ((combo & cageUsed[k]!) === 0) allowed |= combo;
      if (!allowed) return false;
      cageAllowed[k] = allowed;
    }
    return true;
  };

  const place = (c: number, d: number): void => {
    const b = 1 << d;
    grid[c] = d;
    rows[ROW[c]!]! |= b;
    cols[COL[c]!]! |= b;
    boxes[BOX[c]!]! |= b;
    const k = cageOf[c]!;
    if (k >= 0) {
      cageUsed[k]! |= b;
      cageRem[k]! -= d;
      cageLeft[k]!--;
    }
  };
  const unplace = (c: number, d: number): void => {
    const b = ~(1 << d);
    grid[c] = 0;
    rows[ROW[c]!]! &= b;
    cols[COL[c]!]! &= b;
    boxes[BOX[c]!]! &= b;
    const k = cageOf[c]!;
    if (k >= 0) {
      cageUsed[k]! &= b;
      cageRem[k]! += d;
      cageLeft[k]!++;
    }
  };

  const masks = new Uint16Array(81);

  const search = (): void => {
    if (result.count >= limit || result.aborted) return;
    if (++result.nodes > maxNodes) {
      result.aborted = true;
      return;
    }
    if (cages.length && !computeCageAllowed()) return;

    let best = -1;
    let bestMask = 0;
    let bestCnt = 10;
    for (let c = 0; c < 81; c++) {
      if (grid[c]) continue;
      let m = ALL_DIGITS & ~(rows[ROW[c]!]! | cols[COL[c]!]! | boxes[BOX[c]!]!);
      const k = cageOf[c]!;
      if (k >= 0) m &= cageAllowed[k]! & ~cageUsed[k]!;
      masks[c] = m;
      const cnt = POP[m]!;
      if (cnt === 0) return;
      if (cnt < bestCnt) {
        best = c;
        bestMask = m;
        bestCnt = cnt;
      }
    }
    if (best === -1) {
      result.count++;
      if (!result.solution) result.solution = Uint8Array.from(grid);
      else if (!result.second) result.second = Uint8Array.from(grid);
      return;
    }

    // Hidden single forcing: a digit with exactly one home in some house is tried alone.
    if (bestCnt > 1) {
      for (const cells of HOUSE_CELLS) {
        let once = 0;
        let twice = 0;
        let placed = 0;
        for (const c of cells) {
          if (grid[c]) {
            placed |= 1 << grid[c]!;
            continue;
          }
          const m = masks[c]!;
          twice |= once & m;
          once |= m;
        }
        // A missing digit with no home at all: dead end.
        if ((once | placed) !== ALL_DIGITS) return;
        const single = once & ~twice;
        if (!single) continue;
        const low = single & -single;
        for (const c of cells) {
          if (!grid[c] && masks[c]! & low) {
            best = c;
            bestMask = low;
            bestCnt = 1;
            break;
          }
        }
        break;
      }
    }

    let m = bestMask;
    while (m) {
      const low = m & -m;
      m ^= low;
      const d = 31 - Math.clz32(low);
      place(best, d);
      search();
      unplace(best, d);
      if (result.count >= limit || result.aborted) return;
    }
  };

  search();
  return result;
}

/** Number of solutions, capped at `limit`. */
export function countSolutions(p: Puzzle, limit = 2, grid?: Grid): number {
  return exactSolve(p, { limit, grid }).count;
}

/** One solution (the first found), or null if none. */
export function solve(p: Puzzle, grid?: Grid): Grid | null {
  return exactSolve(p, { limit: 1, grid }).solution;
}

export function gridToString(g: Grid): string {
  return Array.from(g, (d) => String(d)).join("");
}
