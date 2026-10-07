/** Hand-made queens fixtures shared by the tests. Region layouts are written row by row. */
import { cellAt, decodeRegions, parseCellName } from "../../../src/engine/queens/geometry";
import { stateFromMarks, type QState } from "../../../src/engine/queens/state";
import { CROSS, QUEEN, type QCell, type QueensPuzzle } from "../../../src/engine/queens/types";

export function puzzle(rows: string[], solution: number[] = [], id = "fixture"): QueensPuzzle {
  return { id, n: rows.length, regions: decodeRegions(rows.join("/")), solution };
}

export function cell(name: string, n: number): QCell {
  const c = parseCellName(name, n);
  if (c === null) throw new Error(`bad cell ${name}`);
  return c;
}

export const cells = (names: string, n: number): QCell[] =>
  names
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => cell(s, n));

/** Marks from cell-name lists: x = crosses, q = queens. */
export function marks(p: QueensPuzzle, x = "", q = ""): Uint8Array {
  const m = new Uint8Array(p.n * p.n);
  for (const c of cells(x, p.n)) m[c] = CROSS;
  for (const c of cells(q, p.n)) m[c] = QUEEN;
  return m;
}

export function state(p: QueensPuzzle, x = "", q = ""): QState {
  return stateFromMarks(p, marks(p, x, q));
}

export const solutionCells = (p: QueensPuzzle): QCell[] => p.solution.map((col, row) => cellAt(row, col, p.n));

/**
 * 5×5, unique. Region 0 is a single cell, so the solve starts with a free queen.
 * Solution: r1c1, r2c3, r3c5, r4c2, r5c4.
 */
export const UNIQUE5 = puzzle(["01112", "11122", "33122", "33442", "33444"], [0, 2, 4, 1, 3], "unique5");

/** 5×5 where every row is its own region: any no-touch permutation works (14 of them). */
export const STRIPES5 = puzzle(["00000", "11111", "22222", "33333", "44444"], [0, 2, 4, 1, 3], "stripes5");
