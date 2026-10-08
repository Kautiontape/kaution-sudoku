/**
 * Shared helpers for the advanced techniques: where each digit can go in each house, strong links
 * (conjugate pairs, bivalue cells) and weak links ("can't both be d").
 *
 * Killer compatibility: strong links come only from rows, columns and boxes (a cage need not
 * contain every digit). Weak links use `sees`, which also counts cage-mates in killer.
 */
import { ALL_DIGITS } from "../combos";
import { CELL_HOUSES, HOUSE_CELLS, PEERS } from "../geometry";
import type { SolverState } from "../state";
import type { CandidateMark, CellId, Digit, Elimination } from "../types";
import { bit, digitContext, digitsOf, placedMask, popcount, sees } from "./util";

/** pos[h * 10 + d] = 9-bit mask of the positions (indices into HOUSE_CELLS[h]) where d is a candidate. */
export type HousePositions = Uint16Array;

export function housePositions(s: SolverState): HousePositions {
  const out = new Uint16Array(27 * 10);
  for (let h = 0; h < 27; h++) {
    const cells = HOUSE_CELLS[h]!;
    for (let i = 0; i < 9; i++) {
      const c = cells[i]!;
      if (s.grid[c]) continue;
      let m = s.cand[c]!;
      while (m) {
        const low = m & -m;
        m ^= low;
        out[h * 10 + (31 - Math.clz32(low))]! |= 1 << i;
      }
    }
  }
  return out;
}

/** Indices of the set bits of a 9-bit position mask, ascending. */
export function positionsOf(mask: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 9; i++) if (mask & (1 << i)) out.push(i);
  return out;
}

/** Cells of house h at the positions in `mask`. */
export function cellsAt(h: number, mask: number): CellId[] {
  return positionsOf(mask).map((i) => HOUSE_CELLS[h]![i]!);
}

export interface Conjugate {
  a: CellId;
  b: CellId;
  /** Flat house id (rows 0-8, columns 9-17, boxes 18-26). */
  house: number;
}

/**
 * Conjugate pairs on digit d: houses where d has exactly two candidate cells, in house order (rows,
 * columns, boxes). A pair that is conjugate in two houses (a row and a box) is listed once.
 */
export function conjugatePairs(s: SolverState, d: Digit, pos: HousePositions = housePositions(s)): Conjugate[] {
  const out: Conjugate[] = [];
  const seen = new Set<number>();
  for (let h = 0; h < 27; h++) {
    const m = pos[h * 10 + d]!;
    if (popcount(m) !== 2) continue;
    const [a, b] = cellsAt(h, m) as [CellId, CellId];
    const key = a * 81 + b;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ a, b, house: h });
  }
  return out;
}

/** A house (row, then column, then box) in which a and b are the only two cells that can hold d; -1 if none. */
export function conjugateHouse(s: SolverState, a: CellId, b: CellId, d: Digit): number {
  const ha = CELL_HOUSES[a]!;
  const hb = CELL_HOUSES[b]!;
  for (let k = 0; k < 3; k++) {
    if (ha[k] !== hb[k]) continue;
    let n = 0;
    for (const c of HOUSE_CELLS[ha[k]!]!) if (!s.grid[c] && s.cand[c]! & bit(d)) n++;
    if (n === 2) return ha[k]!;
  }
  return -1;
}

/** The first house (row, column, box) shared by a and b, or -1 (e.g. they only share a killer cage). */
export function sharedHouse(a: CellId, b: CellId): number {
  const ha = CELL_HOUSES[a]!;
  const hb = CELL_HOUSES[b]!;
  for (let k = 0; k < 3; k++) if (ha[k] === hb[k]) return ha[k]!;
  return -1;
}

/** Peer tables per cage map; built from `cageOf`, the same data `sees` reads, so the two agree. */
const PEER_CACHE = new WeakMap<Int16Array, CellId[][]>();

/** Cells that can never share a digit with c: row/column/box peers plus (killer) cage-mates. Ascending. */
export function peersOf(s: SolverState, c: CellId): readonly CellId[] {
  if (!s.cages.length) return PEERS[c]!;
  let table = PEER_CACHE.get(s.cageOf);
  if (!table) {
    const mates = new Map<number, CellId[]>();
    for (let x = 0; x < 81; x++) {
      const k = s.cageOf[x]!;
      if (k >= 0) mates.set(k, [...(mates.get(k) ?? []), x]);
    }
    table = PEERS.map((list, cell) => {
      const set = new Set(list);
      for (const m of mates.get(s.cageOf[cell]!) ?? []) if (m !== cell) set.add(m);
      return [...set].sort((x, y) => x - y);
    });
    PEER_CACHE.set(s.cageOf, table);
  }
  return table[c]!;
}

/** Empty cells (outside `exclude`) holding candidate d that see every cell in `cells`, ascending. */
export function seeingAll(s: SolverState, cells: readonly CellId[], d: Digit, exclude: readonly CellId[] = cells): CellId[] {
  const out: CellId[] = [];
  const b = bit(d);
  // Anything that sees all of them sees the first one, so its peers are the only candidates.
  for (const c of peersOf(s, cells[0]!)) {
    if (s.grid[c] || !(s.cand[c]! & b) || exclude.includes(c)) continue;
    if (cells.every((x) => sees(s, c, x))) out.push(c);
  }
  return out;
}

/** Eliminations of d from the cells (outside `exclude`) that see every cell in `cells`. */
export function elimSeeingAll(s: SolverState, cells: readonly CellId[], d: Digit, exclude: readonly CellId[] = cells): Elimination[] {
  return seeingAll(s, cells, d, exclude).map((cell) => ({ cell, digit: d }));
}

/**
 * Add `role` marks for candidates not yet marked (first mark wins), so one candidate never carries
 * two roles.
 */
export function addMarks(out: CandidateMark[], marks: readonly CandidateMark[]): CandidateMark[] {
  const seen = new Set(out.map((m) => m.cell * 10 + m.digit));
  for (const m of marks) {
    const k = m.cell * 10 + m.digit;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

/** `marks` (deduplicated) plus "digit" context marks for every other candidate of d. */
export function withContext(s: SolverState, d: Digit, marks: readonly CandidateMark[]): CandidateMark[] {
  const out = addMarks([], marks);
  return addMarks(out, digitContext(s, d, out));
}

/** Digits not yet placed in all nine boxes. */
export function openDigits(s: SolverState): Digit[] {
  let done = ALL_DIGITS;
  for (let b = 18; b < 27; b++) done &= placedMask(s, b);
  return digitsOf(ALL_DIGITS & ~done);
}
