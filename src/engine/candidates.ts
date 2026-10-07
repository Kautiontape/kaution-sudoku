/**
 * Candidate computation from a board state.
 *
 * - `basicCandidates`: sudoku rules only — a digit is possible unless it's already placed in the
 *   cell's row, column, box, or (killer) cage. This is the state hints reason from, so cage
 *   combination logic stays a teachable step rather than being baked in.
 * - `comboCandidates`: basic candidates further narrowed by each cage's sum (only digits that
 *   appear in some valid completion of the cage). Used for killer auto-notes.
 */
import { ALL_DIGITS, bit, cageCombos } from "./combos";
import { PEERS } from "./geometry";
import type { Cage, Candidates, CellId, Grid, Puzzle } from "./types";

export function gridFromPuzzle(p: Puzzle): Grid {
  const g = new Uint8Array(81);
  for (const [k, v] of Object.entries(p.givens ?? {})) g[Number(k)] = v;
  return g;
}

/** cell -> index into `cages`, or -1. */
export function cageIndexMap(cages: readonly Cage[]): Int16Array {
  const m = new Int16Array(81).fill(-1);
  cages.forEach((cage, i) => {
    for (const c of cage.cells) m[c] = i;
  });
  return m;
}

export function basicCandidates(p: Puzzle, grid: Grid): Candidates {
  const cand = new Uint16Array(81);
  const cageOf = cageIndexMap(p.cages);
  for (let c = 0; c < 81; c++) {
    if (grid[c]) continue;
    let m = ALL_DIGITS;
    for (const q of PEERS[c]!) if (grid[q]) m &= ~bit(grid[q]!);
    const k = cageOf[c]!;
    if (k >= 0) for (const q of p.cages[k]!.cells) if (grid[q]) m &= ~bit(grid[q]!);
    cand[c] = m;
  }
  return cand;
}

/**
 * For one cage: which digits each empty cell can take in some complete, valid filling of the cage
 * (distinct digits, right sum, each cell within its candidates). Returns null if the cage cannot
 * be completed at all.
 */
export function cageSupport(cage: Cage, grid: Grid, cand: Candidates): Map<CellId, number> | null {
  let placed = 0;
  let rem = cage.sum;
  const empty: CellId[] = [];
  for (const c of cage.cells) {
    const v = grid[c]!;
    if (v) {
      if (placed & bit(v)) return null;
      placed |= bit(v);
      rem -= v;
    } else empty.push(c);
  }
  const support = new Map<CellId, number>(empty.map((c) => [c, 0]));
  if (empty.length === 0) return rem === 0 ? support : null;
  let any = false;
  for (const combo of cageCombos(empty.length, rem)) {
    if (combo & placed) continue;
    const s = comboSupport(empty, combo, cand);
    if (!s) continue;
    any = true;
    for (let i = 0; i < empty.length; i++) support.set(empty[i]!, support.get(empty[i]!)! | s[i]!);
  }
  return any ? support : null;
}

/**
 * Given cells and a digit set of the same size, the digits each cell can take in some perfect
 * matching (cell -> distinct digit of the set, within candidates). Null if no matching exists.
 */
export function comboSupport(cells: readonly CellId[], combo: number, cand: Candidates): number[] | null {
  const n = cells.length;
  const masks = cells.map((c) => cand[c]! & combo);
  if (masks.some((m) => m === 0)) return null;
  const out = new Array<number>(n).fill(0);
  let found = false;
  if (n <= 5) {
    // Small cages: enumerate every assignment (at most 5! per combo) and record what appears.
    const chosen = new Array<number>(n).fill(0);
    const dfs = (i: number, used: number): void => {
      if (i === n) {
        found = true;
        for (let j = 0; j < n; j++) out[j]! |= chosen[j]!;
        return;
      }
      let m = masks[i]! & ~used;
      while (m) {
        const low = m & -m;
        m ^= low;
        chosen[i] = low;
        dfs(i + 1, used | low);
      }
    };
    dfs(0, 0);
  } else {
    // Big cages: test each (cell, digit) for a completing matching instead of enumerating all.
    for (let i = 0; i < n; i++) {
      let m = masks[i]!;
      while (m) {
        const low = m & -m;
        m ^= low;
        if (hasMatching(masks, i, low)) {
          out[i]! |= low;
          found = true;
        }
      }
    }
  }
  return found ? out : null;
}

/** Is there a perfect matching of cells to distinct digits with cell `fix` taking digit `fixBit`? */
function hasMatching(masks: readonly number[], fix: number, fixBit: number): boolean {
  const n = masks.length;
  const order = masks.map((_, i) => i).filter((i) => i !== fix);
  order.sort((a, b) => popcountSmall(masks[a]!) - popcountSmall(masks[b]!));
  const go = (k: number, used: number): boolean => {
    if (k === order.length) return true;
    let m = masks[order[k]!]! & ~used;
    while (m) {
      const low = m & -m;
      m ^= low;
      if (go(k + 1, used | low)) return true;
    }
    return false;
  };
  return n > 0 && go(0, fixBit);
}

function popcountSmall(m: number): number {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
}

/**
 * For a small group of cells (≤ ~5) that must sum to `target`: the digits each cell can take in some
 * assignment where every cell uses one of its candidates and cells with `differ(i, j)` hold
 * different digits (cells that don't see each other may repeat). Null if no assignment exists.
 */
export function sumSupport(
  masks: readonly number[],
  target: number,
  differ: (i: number, j: number) => boolean,
): number[] | null {
  const n = masks.length;
  const lists = masks.map((m) => {
    const out: number[] = [];
    for (let d = 1; d <= 9; d++) if (m & (1 << d)) out.push(d);
    return out;
  });
  const minRest = new Array<number>(n + 1).fill(0);
  const maxRest = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    const l = lists[i]!;
    if (!l.length) return null;
    minRest[i] = minRest[i + 1]! + l[0]!;
    maxRest[i] = maxRest[i + 1]! + l[l.length - 1]!;
  }
  const out = new Array<number>(n).fill(0);
  const chosen = new Array<number>(n).fill(0);
  let found = false;
  const dfs = (i: number, sum: number): void => {
    if (i === n) {
      if (sum !== target) return;
      found = true;
      for (let j = 0; j < n; j++) out[j]! |= 1 << chosen[j]!;
      return;
    }
    for (const d of lists[i]!) {
      const s2 = sum + d;
      if (s2 + minRest[i + 1]! > target || s2 + maxRest[i + 1]! < target) continue;
      let ok = true;
      for (let j = 0; j < i; j++)
        if (chosen[j] === d && differ(j, i)) {
          ok = false;
          break;
        }
      if (!ok) continue;
      chosen[i] = d;
      dfs(i + 1, s2);
    }
  };
  dfs(0, 0);
  return found ? out : null;
}

/** Basic candidates narrowed by cage combinations, repeated until nothing changes. */
export function comboCandidates(p: Puzzle, grid: Grid, start?: Candidates): Candidates {
  const cand = start ? Uint16Array.from(start) : basicCandidates(p, grid);
  let changed = true;
  while (changed) {
    changed = false;
    for (const cage of p.cages) {
      const s = cageSupport(cage, grid, cand);
      if (!s) continue;
      for (const [c, m] of s) {
        const next = cand[c]! & m;
        if (next !== cand[c]) {
          cand[c] = next;
          changed = true;
        }
      }
    }
  }
  return cand;
}
