import { boxOf, cellName, houseCells, parseCellName, PEERS, sharesHouse } from "../../src/engine/geometry";
import type { Puzzle } from "../../src/engine/types";
import { checkSolution, parseSolution, validatePuzzle } from "../../src/engine/validate";
import fixture from "../fixtures/patterned.json";

const puzzle = fixture as Puzzle;

describe("geometry", () => {
  it("names round-trip", () => {
    for (let c = 0; c < 81; c++) expect(parseCellName(cellName(c))).toBe(c);
    expect(cellName(0)).toBe("r1c1");
    expect(cellName(80)).toBe("r9c9");
    expect(parseCellName("r0c1")).toBe(null);
  });

  it("boxes and houses", () => {
    expect(boxOf(parseCellName("r5c5")!)).toBe(4);
    expect(houseCells({ kind: "box", index: 8 })).toEqual([60, 61, 62, 69, 70, 71, 78, 79, 80]);
    expect(PEERS.every((p) => p.length === 20)).toBe(true);
    expect(sharesHouse(0, 80)).toBe(false);
    expect(sharesHouse(0, 20)).toBe(true);
  });
});

describe("validate", () => {
  it("fixture is structurally valid and its solution checks", () => {
    expect(validatePuzzle(puzzle)).toEqual([]);
    expect(checkSolution(puzzle, parseSolution(puzzle.solution!))).toEqual([]);
  });

  it("detects a cage repeat and wrong sums", () => {
    const g = parseSolution(puzzle.solution!);
    [g[0], g[1]] = [g[1]!, g[0]!]; // swap within a cage: sum ok, but rows/cols break
    expect(checkSolution(puzzle, g).map((i) => i.code)).toContain("house");
    const bad: Puzzle = { ...puzzle, cages: puzzle.cages.map((c, i) => (i === 0 ? { ...c, sum: c.sum + 1 } : c)) };
    expect(validatePuzzle(bad).map((i) => i.code)).toContain("total");
  });

  it("detects uncovered and overlapping cells", () => {
    const missing: Puzzle = { ...puzzle, cages: puzzle.cages.slice(1) };
    expect(validatePuzzle(missing).map((i) => i.code)).toContain("uncovered");
    const overlap: Puzzle = { ...puzzle, cages: [...puzzle.cages, { id: 999, sum: 1, cells: [0] }] };
    expect(validatePuzzle(overlap).map((i) => i.code)).toContain("overlap");
  });
});
