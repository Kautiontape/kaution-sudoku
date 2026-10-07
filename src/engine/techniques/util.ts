/** Shared helpers for techniques. Bit math lives here so techniques stay readable. */
import { bit, digitsOf, popcount } from "../combos";
import { CELL_HOUSES, HOUSE_CELLS, houseAt, PEERS, sharesHouse } from "../geometry";
import type { SolverState } from "../state";
import type { CandidateMark, CellId, Digit, Elimination, House, MarkRole, Step } from "../types";

export { bit, digitsOf, popcount };

export const HOUSE_COUNT = 27;
/** Iteration orders over flat house indices. */
export const BOXES = [18, 19, 20, 21, 22, 23, 24, 25, 26];
export const LINES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
export const ROWS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
export const COLS = [9, 10, 11, 12, 13, 14, 15, 16, 17];
export const ALL_HOUSE_IDS = [...ROWS, ...COLS, ...BOXES];

export const house = (i: number): House => houseAt(i);

/** Empty cells of a house that still have digit d as a candidate. */
export function cellsWith(s: SolverState, h: number, d: Digit): CellId[] {
  const b = bit(d);
  return HOUSE_CELLS[h]!.filter((c) => !s.grid[c] && s.cand[c]! & b);
}

/** Digits already placed in a house, as a mask. */
export function placedMask(s: SolverState, h: number): number {
  let m = 0;
  for (const c of HOUSE_CELLS[h]!) if (s.grid[c]) m |= bit(s.grid[c]!);
  return m;
}

export function emptyIn(s: SolverState, h: number): CellId[] {
  return HOUSE_CELLS[h]!.filter((c) => !s.grid[c]);
}

/** Can a and b never hold the same digit? (shared row/col/box, or the same killer cage) */
export function sees(s: SolverState, a: CellId, b: CellId): boolean {
  if (a === b) return false;
  if (sharesHouse(a, b)) return true;
  const k = s.cageOf[a]!;
  return k >= 0 && k === s.cageOf[b];
}

/** Cells (empty, not in `exclude`) that see every cell in `cells`. */
export function commonPeers(s: SolverState, cells: readonly CellId[], exclude: readonly CellId[] = cells): CellId[] {
  const out: CellId[] = [];
  for (let c = 0; c < 81; c++) {
    if (s.grid[c] || exclude.includes(c)) continue;
    if (cells.every((x) => sees(s, c, x))) out.push(c);
  }
  return out;
}

/** Eliminations of digit d from cells that currently have it. */
export function elimDigit(s: SolverState, cells: Iterable<CellId>, d: Digit): Elimination[] {
  const out: Elimination[] = [];
  const b = bit(d);
  for (const c of cells) if (!s.grid[c] && s.cand[c]! & b) out.push({ cell: c, digit: d });
  return out;
}

/** Eliminations of every digit in `mask` from cells that currently have it. */
export function elimMask(s: SolverState, cells: Iterable<CellId>, mask: number): Elimination[] {
  const out: Elimination[] = [];
  for (const c of cells) {
    if (s.grid[c]) continue;
    for (const d of digitsOf(s.cand[c]! & mask)) out.push({ cell: c, digit: d });
  }
  return out;
}

export function dedupeElims(elims: Elimination[]): Elimination[] {
  const seen = new Set<number>();
  const out: Elimination[] = [];
  for (const e of elims) {
    const k = e.cell * 10 + e.digit;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out.sort((a, b) => a.cell - b.cell || a.digit - b.digit);
}

/** k-combinations of an array, in lexicographic order. */
export function* combinations<T>(arr: readonly T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield [...acc];
    return;
  }
  for (let i = start; i <= arr.length - (k - acc.length); i++) {
    acc.push(arr[i]!);
    yield* combinations(arr, k, i + 1, acc);
    acc.pop();
  }
}

/** Marks for every candidate in `cells` restricted to `mask`, all with one role. */
export function marksFor(s: SolverState, cells: Iterable<CellId>, mask: number, role: MarkRole): CandidateMark[] {
  const out: CandidateMark[] = [];
  for (const c of cells) for (const d of digitsOf(s.cand[c]! & mask)) out.push({ cell: c, digit: d, role });
  return out;
}

/** Marks for eliminations (role "elim"). */
export function elimMarks(elims: readonly Elimination[]): CandidateMark[] {
  return elims.map((e) => ({ cell: e.cell, digit: e.digit, role: "elim" as const }));
}

/** Context marks: every candidate of digit d on the board (role "digit"), skipping cells in `skip`. */
export function digitContext(s: SolverState, d: Digit, skip: readonly CandidateMark[] = []): CandidateMark[] {
  const taken = new Set(skip.filter((m) => m.digit === d).map((m) => m.cell));
  const out: CandidateMark[] = [];
  const b = bit(d);
  for (let c = 0; c < 81; c++) if (!s.grid[c] && s.cand[c]! & b && !taken.has(c)) out.push({ cell: c, digit: d, role: "digit" });
  return out;
}

/** Placed cells with digit d that see `cell` (row/col/box, or cage in killer). */
export function blockersOf(s: SolverState, cell: CellId, d: Digit): CellId[] {
  const out: CellId[] = [];
  for (const p of PEERS[cell]!) if (s.grid[p] === d) out.push(p);
  const k = s.cageOf[cell]!;
  if (k >= 0) for (const p of s.cages[k]!.cells) if (p !== cell && s.grid[p] === d) out.push(p);
  return out;
}

/** The houses (flat ids) shared by all cells, in row/col/box order. */
export function sharedHouses(cells: readonly CellId[]): number[] {
  if (!cells.length) return [];
  return CELL_HOUSES[cells[0]!]!.filter((h) => cells.every((c) => CELL_HOUSES[c]!.includes(h)));
}

/** Assemble a step with sensible defaults. */
export function makeStep(p: Partial<Step> & Pick<Step, "technique" | "tier" | "rating" | "explain">): Step {
  return {
    placements: [],
    eliminations: [],
    focus: { cells: [], cages: [], houses: [] },
    ...p,
  };
}
