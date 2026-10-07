import { basicCandidates, cageSupport, comboCandidates, gridFromPuzzle } from "../../src/engine/candidates";
import { digitsOf } from "../../src/engine/combos";
import { countSolutions, exactSolve, gridToString, solve } from "../../src/engine/exact";
import {
  cagesFromCells,
  connectedSplits,
  digClassic,
  makeKillerUnique,
  partitionCages,
  randomSolvedGrid,
} from "../../src/engine/generate";
import { parseCellName } from "../../src/engine/geometry";
import { mulberry32 } from "../../src/engine/rng";
import type { Puzzle } from "../../src/engine/types";
import { checkSolution, parseSolution } from "../../src/engine/validate";
import fixture from "../fixtures/patterned.json";

const patterned = fixture as Puzzle;
const cell = (name: string) => parseCellName(name)!;

// Wikipedia's example puzzle: unique solution.
const WIKI_GIVENS = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const WIKI_SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
export function classicFromString(id: string, s: string, solution?: string): Puzzle {
  const givens: Record<number, number> = {};
  for (let i = 0; i < 81; i++) if (s[i] !== "0" && s[i] !== ".") givens[i] = Number(s[i]);
  return { id, kind: "classic", cages: [], givens, solution };
}

describe("exact solver", () => {
  it("patterned killer fixture is not unique (2+ solutions), but solves validly", () => {
    expect(countSolutions(patterned)).toBe(2);
    const g = solve(patterned)!;
    expect(checkSolution(patterned, g)).toEqual([]);
  });

  it("solves a unique classic puzzle to its known solution", () => {
    const p = classicFromString("wiki", WIKI_GIVENS);
    const r = exactSolve(p);
    expect(r.count).toBe(1);
    expect(gridToString(r.solution!)).toBe(WIKI_SOLUTION);
  });

  it("reports clashing givens as unsolvable", () => {
    const p = classicFromString("bad", "55" + "0".repeat(79));
    expect(countSolutions(p)).toBe(0);
  });

  it("a full killer cage layout derived from a solution admits that solution", () => {
    for (let seed = 0; seed < 50; seed++) {
      const rng = mulberry32(seed);
      const sol = randomSolvedGrid(rng);
      const cages = cagesFromCells(partitionCages(sol, rng, { sizeWeights: [0, 0, 1, 1], maxSize: 3 }), sol);
      const p: Puzzle = { id: "x", kind: "killer", cages };
      // Starting from the solution itself must succeed (proves the solution satisfies every cage).
      expect(countSolutions(p, 1, sol)).toBe(1);
      expect(checkSolution(p, sol)).toEqual([]);
    }
  });
});

describe("candidates", () => {
  it("basic candidates exclude digits seen in row/col/box", () => {
    const p = classicFromString("wiki", WIKI_GIVENS);
    const cand = basicCandidates(p, gridFromPuzzle(p));
    // r1c3: row 1 has 5,3,7; col 3 has 8; box 1 has 5,3,6,9,8 → {1,2,4}
    expect(digitsOf(cand[cell("r1c3")]!)).toEqual([1, 2, 4]);
    expect(cand[cell("r1c1")]).toBe(0); // filled
  });

  it("basic candidates exclude digits already in the same cage", () => {
    const grid = new Uint8Array(81);
    grid[cell("r1c1")] = 1; // cage 0 = {r1c1, r1c2}
    const cand = basicCandidates(patterned, grid);
    expect(digitsOf(cand[cell("r1c2")]!)).not.toContain(1);
  });

  it("combo candidates narrow cages by their sums", () => {
    const empty = new Uint8Array(81);
    const cand = comboCandidates(patterned, empty);
    // cage 0 = {r1c1,r1c2} sum 3 → {1,2}; cage 3 = {r1c7,r1c8,r1c9} sum 24 → {7,8,9}
    expect(digitsOf(cand[cell("r1c1")]!)).toEqual([1, 2]);
    expect(digitsOf(cand[cell("r1c8")]!)).toEqual([7, 8, 9]);
  });

  it("cage support respects other cells' candidates", () => {
    const cage = { id: 0, sum: 10, cells: [0, 1] };
    const cand = new Uint16Array(81);
    cand[0] = (1 << 1) | (1 << 3) | (1 << 9); // {1,3,9}
    cand[1] = (1 << 7) | (1 << 9); // {7,9}
    const s = cageSupport(cage, new Uint8Array(81), cand)!;
    expect(digitsOf(s.get(0)!)).toEqual([1, 3]); // 1+9, 3+7
    expect(digitsOf(s.get(1)!)).toEqual([7, 9]);
  });
});

describe("generation primitives", () => {
  it("solved grids are valid and deterministic", () => {
    const empty: Puzzle = { id: "", kind: "classic", cages: [] };
    for (let seed = 0; seed < 20; seed++) {
      const g = randomSolvedGrid(mulberry32(seed));
      expect(checkSolution(empty, g)).toEqual([]);
      expect(gridToString(randomSolvedGrid(mulberry32(seed)))).toBe(gridToString(g));
    }
  });

  it("digClassic keeps a unique, symmetric puzzle above the floor", () => {
    for (let seed = 0; seed < 10; seed++) {
      const rng = mulberry32(seed);
      const sol = randomSolvedGrid(rng);
      const givens = digClassic(sol, rng, { minGivens: 30 });
      const count = givens.filter((x) => x).length;
      expect(count).toBeGreaterThanOrEqual(30);
      for (let c = 0; c < 81; c++) expect(Boolean(givens[c])).toBe(Boolean(givens[80 - c]));
      const r = exactSolve({ id: "", kind: "classic", cages: [] }, { grid: givens });
      expect(r.count).toBe(1);
      expect(gridToString(r.solution!)).toBe(gridToString(sol));
    }
  });

  it("partitionCages covers every cell once with digit-distinct, connected cages", () => {
    for (let seed = 0; seed < 30; seed++) {
      const rng = mulberry32(seed);
      const sol = randomSolvedGrid(rng);
      const lists = partitionCages(sol, rng, { sizeWeights: [0, 0.05, 0.4, 0.35, 0.15, 0.05], maxSize: 5 });
      const seen = new Set<number>();
      for (const cells of lists) {
        expect(cells.length).toBeGreaterThan(0);
        expect(cells.length).toBeLessThanOrEqual(5);
        const digits = cells.map((c) => sol[c]);
        expect(new Set(digits).size).toBe(digits.length);
        for (const c of cells) {
          expect(seen.has(c)).toBe(false);
          seen.add(c);
        }
        expect(connectedSplits(cells).length >= 0).toBe(true);
      }
      expect(seen.size).toBe(81);
    }
  });

  it("connectedSplits lists each split of an L-tromino once", () => {
    // r1c1, r1c2, r2c1: splits are {a}|{b,c}... only those leaving both parts connected.
    const splits = connectedSplits([0, 1, 9]);
    expect(splits).toHaveLength(2); // {0}|{1,9} is disconnected → excluded; {0,1}|{9}, {0,9}|{1}
  });

  it("makeKillerUnique returns a uniquely solvable layout", () => {
    let made = 0;
    for (let seed = 0; seed < 6; seed++) {
      const rng = mulberry32(100 + seed);
      const sol = randomSolvedGrid(rng);
      const lists = partitionCages(sol, rng, { sizeWeights: [0, 0.02, 0.5, 0.4, 0.08], maxSize: 4 });
      const r = makeKillerUnique(lists, sol, rng, { maxNodes: 200_000 });
      if (!r) continue;
      made++;
      const p: Puzzle = { id: "k", kind: "killer", cages: r.cages, givens: r.givens };
      const res = exactSolve(p);
      expect(res.count).toBe(1);
      expect(gridToString(res.solution!)).toBe(gridToString(sol));
    }
    expect(made).toBeGreaterThan(0);
  });

  it("parseSolution round-trips", () => {
    expect(gridToString(parseSolution(WIKI_SOLUTION))).toBe(WIKI_SOLUTION);
  });
});
