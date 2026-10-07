import {
  applyStep,
  findEmptyUnit,
  initialState,
  isSolved,
  possibleCells,
  queenCells,
  stateFromMarks,
  stepChanges,
  unitHasQueen,
} from "../../../src/engine/queens/state";
import type { QStep } from "../../../src/engine/queens/types";
import { cell, cells, marks, solutionCells, state, UNIQUE5 } from "./fixtures";

const n = UNIQUE5.n;
const possibleNames = (s: ReturnType<typeof initialState>) =>
  [...s.possible].flatMap((v, c) => (v ? [c] : []));

function step(placements: number[], eliminations: number[]): QStep {
  return {
    technique: "test",
    tier: 1,
    rating: 1,
    placements,
    eliminations,
    focus: { cells: [], rows: [], cols: [], regions: [] },
    explain: { kind: "test" },
  };
}

describe("queens state", () => {
  it("starts with every cell possible", () => {
    const s = initialState(UNIQUE5);
    expect(possibleNames(s).length).toBe(25);
    expect(queenCells(s)).toEqual([]);
    expect(isSolved(s)).toBe(false);
    expect(findEmptyUnit(s)).toBe(null);
  });

  it("player crosses are authoritative and queens rule out row, column, region and neighbours", () => {
    // Queen on r2c3 (region 1). Cross on r5c5.
    const s = state(UNIQUE5, "r5c5", "r2c3");
    expect(queenCells(s)).toEqual([cell("r2c3", n)]);
    expect(possibleNames(s)).toEqual(cells("r1c1 r1c5 r3c1 r3c5 r4c1 r4c2 r4c4 r4c5 r5c1 r5c2 r5c4", n));
    expect(unitHasQueen(s, { type: "region", index: 1 })).toBe(true);
    expect(unitHasQueen(s, { type: "region", index: 2 })).toBe(false);
    expect(possibleCells(s, { type: "region", index: 2 })).toEqual(cells("r1c5 r3c5 r4c5", n));
    expect(possibleCells(s, { type: "row", index: 1 })).toEqual([]);
  });

  it("detects a unit left with no place for its queen", () => {
    // Crossing out the lone cell of region 0 leaves it empty.
    expect(findEmptyUnit(state(UNIQUE5, "r1c1"))).toEqual({ type: "region", index: 0 });
    // Queens on r1c1 and r2c3 rule out all of rows 1 and 2, but both rows already have their queen.
    expect(findEmptyUnit(state(UNIQUE5, "", "r1c1 r2c3"))).toBe(null);
  });

  it("applyStep returns a new state and leaves the input alone", () => {
    const s0 = initialState(UNIQUE5);
    const st = step([cell("r1c1", n)], [cell("r5c5", n)]);
    expect(stepChanges(s0, st)).toBe(true);
    const s1 = applyStep(s0, st);
    expect(possibleNames(s0).length).toBe(25);
    expect(queenCells(s1)).toEqual([cell("r1c1", n)]);
    expect(s1.possible[cell("r5c5", n)]).toBe(0);
    expect(s1.possible[cell("r2c2", n)]).toBe(0); // touches the queen
    expect(stepChanges(s1, st)).toBe(false);
  });

  it("is solved once every solution queen is placed", () => {
    const sol = solutionCells(UNIQUE5);
    const m = marks(UNIQUE5);
    for (const c of sol) m[c] = 2;
    const s = stateFromMarks(UNIQUE5, m);
    expect(isSolved(s)).toBe(true);
    expect(possibleNames(s)).toEqual([]);
    expect(findEmptyUnit(s)).toBe(null);
  });

  it("rejects marks of the wrong length", () => {
    expect(() => stateFromMarks(UNIQUE5, new Uint8Array(24))).toThrow();
  });
});
