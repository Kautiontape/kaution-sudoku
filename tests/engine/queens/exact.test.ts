import { countSolutions, findSolutions, isValidSolution, solve, validateQueensPuzzle } from "../../../src/engine/queens/exact";
import type { QueensPuzzle } from "../../../src/engine/queens/types";
import { puzzle, STRIPES5, UNIQUE5 } from "./fixtures";

const codes = (p: QueensPuzzle) => validateQueensPuzzle(p).map((i) => i.code);

describe("queens exact solver", () => {
  it("solves a unique fixture to its stored solution", () => {
    expect(countSolutions(UNIQUE5)).toBe(1);
    expect(solve(UNIQUE5)).toEqual(UNIQUE5.solution);
    expect(findSolutions(UNIQUE5, 10)).toEqual([UNIQUE5.solution]);
  });

  it("counts every no-touch permutation when regions are just rows", () => {
    // OEIS A002464: permutations of n with no adjacent values in adjacent positions.
    expect(countSolutions(STRIPES5, 1000)).toBe(14);
    expect(countSolutions(STRIPES5)).toBe(2); // stops at the default limit
    const stripes6 = puzzle(["000000", "111111", "222222", "333333", "444444", "555555"]);
    expect(countSolutions(stripes6, 1000)).toBe(90);
    for (const s of findSolutions(STRIPES5, 1000)) expect(isValidSolution(STRIPES5, s)).toBe(true);
  });

  it("finds exactly two solutions when regions pair up the queens of two permutations", () => {
    // Each region holds one queen of [0,2,4,1,3] and one of [0,3,1,4,2]; no third layout fits.
    const p = puzzle(["01112", "33112", "33112", "33442", "33444"]);
    expect(findSolutions(p, 10)).toEqual([
      [0, 2, 4, 1, 3],
      [0, 3, 1, 4, 2],
    ]);
    expect(countSolutions(p)).toBe(2);
    expect(countSolutions(p, 1)).toBe(1);
  });

  it("returns null when there is no solution", () => {
    // Two single-cell regions that touch can't both hold a queen.
    const p = puzzle(["01222", "22222", "22222", "34444", "34444"]);
    expect(solve(p)).toBe(null);
    expect(countSolutions(p)).toBe(0);
  });

  it("isValidSolution checks every rule", () => {
    expect(isValidSolution(UNIQUE5, [0, 2, 4, 1, 3])).toBe(true);
    expect(isValidSolution(UNIQUE5, [0, 1, 4, 2, 3])).toBe(false); // touching rows
    expect(isValidSolution(UNIQUE5, [0, 2, 4, 1, 4])).toBe(false); // column twice
    expect(isValidSolution(STRIPES5, [0, 3, 1, 4, 2])).toBe(true);
    expect(isValidSolution(UNIQUE5, [0, 3, 1, 4, 2])).toBe(false); // region 2 twice, region 1 empty
    expect(isValidSolution(UNIQUE5, [0, 2, 4])).toBe(false);
  });
});

describe("validateQueensPuzzle", () => {
  it("accepts a valid fixture", () => {
    expect(validateQueensPuzzle(UNIQUE5)).toEqual([]);
  });

  it("flags size problems", () => {
    expect(codes({ ...UNIQUE5, n: 4, regions: UNIQUE5.regions.slice(0, 16) })).toContain("size");
    expect(codes({ ...UNIQUE5, regions: UNIQUE5.regions.slice(1) })).toEqual(["regions-length"]);
  });

  it("flags bad, empty and disconnected regions", () => {
    const outOfRange = { ...UNIQUE5, regions: UNIQUE5.regions.map((g, i) => (i === 0 ? 7 : g)) };
    expect(codes(outOfRange)).toContain("region-range");
    // region 0 (r1c1) is swallowed by region 1, so region 0 is empty
    const empty = { ...UNIQUE5, regions: UNIQUE5.regions.map((g) => (g === 0 ? 1 : g)) };
    expect(codes(empty)).toContain("region-empty");
    // region 2 split in two: r1c5 alone at the top, the rest below
    const split = puzzle(["01112", "11111", "33122", "33442", "33444"], [0, 2, 4, 1, 3]);
    expect(codes(split)).toContain("region-disconnected");
  });

  it("flags solutions that break the rules", () => {
    expect(codes({ ...UNIQUE5, solution: [0, 2] })).toEqual(["solution-length"]);
    expect(codes({ ...UNIQUE5, solution: [0, 2, 4, 1, 5] })).toContain("solution-range");
    expect(codes({ ...UNIQUE5, solution: [0, 2, 4, 1, 1] })).toContain("solution-column");
    expect(codes({ ...UNIQUE5, solution: [0, 1, 4, 2, 3] })).toContain("solution-touch");
    expect(codes({ ...STRIPES5, regions: UNIQUE5.regions, solution: [0, 3, 1, 4, 2] })).toContain("solution-region");
  });
});
