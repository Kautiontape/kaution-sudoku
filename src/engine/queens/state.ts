/**
 * Solver state: which cells can still hold a queen and which hold one. A cell is possible iff it
 * isn't crossed out, isn't a queen, and isn't ruled out by a queen (same row, column or region,
 * or touching). Player crosses are authoritative, like pencil notes: the hint audit catches
 * crosses on solution cells before the solver ever sees them.
 */
import { makeBoard, unitId, type QBoard } from "./geometry";
import { CROSS, QUEEN, type Marks, type QCell, type QStep, type QueensPuzzle, type Unit } from "./types";

export interface QState {
  readonly board: QBoard;
  /** 1 = the cell can still hold a queen. */
  readonly possible: Uint8Array;
  /** 1 = the cell holds a queen. */
  readonly queens: Uint8Array;
}

/** Fresh state: every cell possible, no queens. */
export function initialState(p: Pick<QueensPuzzle, "n" | "regions">): QState {
  const board = makeBoard(p);
  return { board, possible: new Uint8Array(board.size).fill(1), queens: new Uint8Array(board.size) };
}

/** State from the player's marks: crosses rule cells out, queens rule out everything they attack. */
export function stateFromMarks(p: Pick<QueensPuzzle, "n" | "regions">, marks: Marks): QState {
  const s = initialState(p);
  if (marks.length !== s.board.size) throw new Error(`Expected ${s.board.size} marks, got ${marks.length}`);
  for (let c = 0; c < marks.length; c++) if (marks[c] === CROSS) s.possible[c] = 0;
  for (let c = 0; c < marks.length; c++) if (marks[c] === QUEEN) placeQueen(s, c);
  return s;
}

export function cloneState(s: QState): QState {
  return { board: s.board, possible: s.possible.slice(), queens: s.queens.slice() };
}

/** Mutates: puts a queen on c and rules out every cell it attacks. */
export function placeQueen(s: QState, c: QCell): void {
  s.queens[c] = 1;
  s.possible[c] = 0;
  for (const a of s.board.attacks[c]!) s.possible[a] = 0;
}

/** Mutates: c can no longer hold a queen. */
export function eliminate(s: QState, c: QCell): void {
  s.possible[c] = 0;
}

/** True if applying the step would change anything (a new queen or a cell ruled out). */
export function stepChanges(s: QState, step: QStep): boolean {
  return step.placements.some((c) => !s.queens[c]) || step.eliminations.some((c) => s.possible[c] === 1);
}

/** A new state with the step applied; the input is left untouched. */
export function applyStep(s: QState, step: QStep): QState {
  const next = cloneState(s);
  for (const c of step.eliminations) eliminate(next, c);
  for (const c of step.placements) placeQueen(next, c);
  return next;
}

export function queenCells(s: QState): QCell[] {
  const out: QCell[] = [];
  for (let c = 0; c < s.queens.length; c++) if (s.queens[c]) out.push(c);
  return out;
}

export function isSolved(s: QState): boolean {
  return queenCells(s).length === s.board.n;
}

/** Cells of the unit that can still hold a queen. */
export function possibleCells(s: QState, u: Unit): QCell[] {
  return s.board.cellsByUnit[unitId(u, s.board.n)]!.filter((c) => s.possible[c] === 1);
}

export function unitHasQueen(s: QState, u: Unit): boolean {
  return s.board.cellsByUnit[unitId(u, s.board.n)]!.some((c) => s.queens[c] === 1);
}

/** The first unit (regions, rows, columns) with no queen and no possible cell, or null. */
export function findEmptyUnit(s: QState): Unit | null {
  const { board } = s;
  for (let id = 0; id < board.units.length; id++) {
    const cells = board.cellsByUnit[id]!;
    if (!cells.some((c) => s.queens[c] || s.possible[c])) return board.units[id]!;
  }
  return null;
}
