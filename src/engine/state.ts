/**
 * Solver state: placed digits + candidate bitmasks. Techniques read it and return a Step;
 * `applyStep` writes the step back. Pure data, cheap to clone.
 */
import { bit } from "./combos";
import { basicCandidates, cageIndexMap, gridFromPuzzle } from "./candidates";
import { PEERS } from "./geometry";
import { puzzleKind, type Cage, type CellId, type Digit, type Grid, type Puzzle, type PuzzleKind, type Step } from "./types";

export interface SolverState {
  readonly kind: PuzzleKind;
  readonly grid: Uint8Array;
  /** 0 for filled cells. */
  readonly cand: Uint16Array;
  readonly cages: readonly Cage[];
  /** cell -> index into `cages`, -1 if none. */
  readonly cageOf: Int16Array;
}

/**
 * Build a state from a puzzle, an optional current grid (defaults to the givens), and optional
 * player notes. Notes narrow a cell's candidates when present (they're the player's record of
 * eliminations); cells without notes get basic candidates. Notes that would leave a cell with no
 * candidates are ignored for that cell.
 */
export function createState(p: Puzzle, grid?: Grid, notes?: ArrayLike<number> | null): SolverState {
  const g = grid ? Uint8Array.from(grid) : gridFromPuzzle(p);
  const cand = basicCandidates(p, g);
  if (notes) {
    for (let c = 0; c < 81; c++) {
      const n = notes[c] ?? 0;
      if (g[c] || !n) continue;
      const narrowed = cand[c]! & n;
      if (narrowed) cand[c] = narrowed;
    }
  }
  return { kind: puzzleKind(p), grid: g, cand, cages: p.cages, cageOf: cageIndexMap(p.cages) };
}

export function cloneState(s: SolverState): SolverState {
  return { ...s, grid: Uint8Array.from(s.grid), cand: Uint16Array.from(s.cand) };
}

export function cageMates(s: SolverState, c: CellId): readonly CellId[] {
  const k = s.cageOf[c]!;
  return k >= 0 ? s.cages[k]!.cells : [];
}

export function placeDigit(s: SolverState, c: CellId, d: Digit): void {
  s.grid[c] = d;
  s.cand[c] = 0;
  const off = ~bit(d);
  for (const p of PEERS[c]!) s.cand[p]! &= off;
  for (const p of cageMates(s, c)) if (p !== c) s.cand[p]! &= off;
}

export function eliminate(s: SolverState, c: CellId, d: Digit): boolean {
  const before = s.cand[c]!;
  s.cand[c] = before & ~bit(d);
  return s.cand[c] !== before;
}

export function applyStep(s: SolverState, step: Step): void {
  for (const e of step.eliminations) eliminate(s, e.cell, e.digit);
  for (const pl of step.placements) placeDigit(s, pl.cell, pl.digit);
}

export function isSolved(s: SolverState): boolean {
  for (let c = 0; c < 81; c++) if (!s.grid[c]) return false;
  return true;
}

/** An empty cell with no candidates left. */
export function isBroken(s: SolverState): boolean {
  for (let c = 0; c < 81; c++) if (!s.grid[c] && !s.cand[c]) return true;
  return false;
}

export function emptyCells(s: SolverState): CellId[] {
  const out: CellId[] = [];
  for (let c = 0; c < 81; c++) if (!s.grid[c]) out.push(c);
  return out;
}
