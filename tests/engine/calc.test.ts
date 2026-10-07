import { evaluateTape, formatResult, formatTape, UnknownCageError, type Term } from "../../src/engine/calc";
import { parseCellName } from "../../src/engine/geometry";
import type { Puzzle } from "../../src/engine/types";
import fixture from "../fixtures/patterned.json";

// Row 1 of the fixture: cages 0={r1c1,r1c2}=3, 1={r1c3,r1c4}=7, 2={r1c5,r1c6}=11, 3={r1c7,r1c8,r1c9}=24
const puzzle = fixture as Puzzle;
const empty = () => new Uint8Array(81);
const cell = (name: string): number => {
  const id = parseCellName(name);
  if (id === null) throw new Error(name);
  return id;
};

const lit = (value: number, sign: 1 | -1 = 1): Term => ({ kind: "literal", value, sign });
const cage = (cageId: number, sign: 1 | -1 = -1): Term => ({ kind: "cage", cageId, sign });
const sym = (name: string, sign: 1 | -1 = -1): Term => ({ kind: "cell", cell: cell(name), sign });

describe("evaluateTape", () => {
  it("pure arithmetic: 45 − 8 − [7] = 30", () => {
    const r = evaluateTape([lit(45), lit(8, -1), cage(1)], { puzzle, grid: empty() });
    expect(r).toEqual({ kind: "number", value: 30 });
  });

  it("45 rule leftover: subtracted empty cells become the left side", () => {
    const terms = [lit(45), cage(0), cage(1), cage(2), sym("r1c7"), sym("r1c8"), sym("r1c9")];
    const r = evaluateTape(terms, { puzzle, grid: empty() });
    expect(formatResult(r)).toBe("r1c7 + r1c8 + r1c9 = 24");
    expect(r.kind === "equation" && r.solved).toBe(null);
  });

  it("filled cells contribute their value; a single leftover cell is solved", () => {
    const grid = empty();
    grid[cell("r1c7")] = 7;
    grid[cell("r1c8")] = 8;
    const terms = [lit(45), cage(0), cage(1), cage(2), sym("r1c7"), sym("r1c8"), sym("r1c9")];
    const r = evaluateTape(terms, { puzzle, grid });
    expect(formatResult(r)).toBe("r1c9 = 9");
    expect(r.kind === "equation" && r.solved).toEqual({ cell: cell("r1c9"), value: 9, valid: true });
  });

  it("outies (added cells) go to the right side", () => {
    const r = evaluateTape([lit(10), sym("r1c1"), sym("r2c1", 1)], { puzzle, grid: empty() });
    expect(formatResult(r)).toBe("r1c1 = 10 + r2c1");
    expect(r.kind === "equation" && r.solved).toBe(null);
  });

  it("only added cells: flips so cells read on the left", () => {
    const r = evaluateTape([lit(12, -1), sym("r1c1", 1), sym("r1c2", 1)], { puzzle, grid: empty() });
    expect(formatResult(r)).toBe("r1c1 + r1c2 = 12");
  });

  it("duplicate cell terms combine and can cancel", () => {
    const r = evaluateTape([lit(5), sym("r1c1", 1), sym("r1c1", -1)], { puzzle, grid: empty() });
    expect(r).toEqual({ kind: "number", value: 5 });
    const r2 = evaluateTape([lit(10), sym("r1c1"), sym("r1c1")], { puzzle, grid: empty() });
    expect(formatResult(r2)).toBe("2·r1c1 = 10");
    expect(r2.kind === "equation" && r2.solved).toEqual({ cell: cell("r1c1"), value: 5, valid: true });
  });

  it("flags impossible single-cell results", () => {
    const r = evaluateTape([lit(45), sym("r1c1")], { puzzle, grid: empty() });
    expect(r.kind === "equation" && r.solved?.valid).toBe(false);
  });

  it("virtual cages are addressable", () => {
    const extraCages = [{ id: 100, sum: 9, cells: [cell("r3c2"), cell("r3c3")], virtual: true }];
    const r = evaluateTape([lit(20), cage(100)], { puzzle, grid: empty(), extraCages });
    expect(r).toEqual({ kind: "number", value: 11 });
  });

  it("unknown cage throws", () => {
    expect(() => evaluateTape([cage(999)], { puzzle, grid: empty() })).toThrow(UnknownCageError);
  });
});

describe("formatTape", () => {
  it("renders cages by clue and filled cells with values", () => {
    const grid = empty();
    grid[cell("r3c4")] = 4;
    const s = formatTape([lit(45), lit(8, -1), cage(3), sym("r3c4"), sym("r3c2", 1)], { puzzle, grid });
    expect(s).toBe("45 − 8 − [24] − r3c4=4 + r3c2");
  });
});
