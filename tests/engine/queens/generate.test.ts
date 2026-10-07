import { mulberry32 } from "../../../src/engine/rng";
import { countSolutions, isValidSolution, validateQueensPuzzle } from "../../../src/engine/queens/exact";
import {
  attemptFor,
  DEFAULT_STYLE,
  generateQueens,
  generateQueensFor,
  growRegions,
  randomPlacement,
  repairUniqueness,
  STYLE_FOR_DIFFICULTY,
} from "../../../src/engine/queens/generate";
import { cellAt, isConnected, regionCells } from "../../../src/engine/queens/geometry";
import { SIZE_FOR_DIFFICULTY } from "../../../src/engine/queens/grade";
import { solveLogically } from "../../../src/engine/queens/logical";
import { DIFFICULTIES } from "../../../src/engine/types";

describe("queens generator building blocks", () => {
  it("random placements obey the rules", () => {
    for (let n = 5; n <= 11; n++)
      for (let seed = 1; seed <= 10; seed++) {
        const sol = randomPlacement(mulberry32(seed), n);
        expect(new Set(sol).size).toBe(n);
        for (let r = 1; r < n; r++) expect(Math.abs(sol[r]! - sol[r - 1]!)).toBeGreaterThanOrEqual(2);
      }
  });

  it("grows n connected regions, one around each queen", () => {
    for (const n of [6, 9, 11])
      for (let seed = 1; seed <= 10; seed++) {
        const rng = mulberry32(seed);
        const sol = randomPlacement(rng, n);
        const regions = growRegions(rng, n, sol, DEFAULT_STYLE);
        expect(regions.every((g) => g >= 0 && g < n)).toBe(true);
        for (let g = 0; g < n; g++) expect(isConnected(regionCells(regions, g), n)).toBe(true);
        expect(isValidSolution({ n, regions }, sol)).toBe(true);
      }
  });

  it("uniqueness repair keeps the intended solution and connectivity", () => {
    let repaired = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const n = 8;
      const rng = mulberry32(seed);
      const sol = randomPlacement(rng, n);
      const regions = growRegions(rng, n, sol);
      if (!repairUniqueness(rng, n, regions, sol)) continue;
      repaired++;
      expect(countSolutions({ n, regions })).toBe(1);
      expect(isValidSolution({ n, regions }, sol)).toBe(true);
      for (let g = 0; g < n; g++) expect(isConnected(regionCells(regions, g), n)).toBe(true);
    }
    expect(repaired).toBeGreaterThanOrEqual(10);
  });
});

describe("generateQueens", () => {
  it("is deterministic per seed", () => {
    for (const n of [6, 8, 10]) {
      const made: { seed: number; p: NonNullable<ReturnType<typeof generateQueens>> }[] = [];
      for (let seed = 40; made.length < 2; seed++) {
        const p = generateQueens({ n, seed });
        if (p) made.push({ seed, p });
        else expect(generateQueens({ n, seed })).toBe(null); // failures are deterministic too
      }
      const [a, b] = made as [(typeof made)[0], (typeof made)[0]];
      expect(generateQueens({ n, seed: a.seed })).toEqual(a.p);
      expect(b.p.regions).not.toEqual(a.p.regions);
    }
  });

  it("makes valid puzzles with exactly one solution", () => {
    let made = 0;
    for (const n of [5, 7, 9, 11])
      for (let seed = 1; seed <= 8; seed++) {
        const p = generateQueens({ n, seed });
        if (!p) continue;
        made++;
        expect(validateQueensPuzzle(p)).toEqual([]);
        expect(countSolutions(p, 2)).toBe(1);
        expect(p.id).toBe(`queens-${n}-${seed}`);
        expect(p.meta).toEqual({ seed });
      }
    expect(made).toBeGreaterThanOrEqual(16);
  });

  it("mixes small and large regions", () => {
    const sizes: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const p = generateQueens({ n: 9, seed });
      if (!p) continue;
      for (let g = 0; g < 9; g++) sizes.push(regionCells(p.regions, g).length);
    }
    expect(sizes.some((s) => s <= 3)).toBe(true);
    expect(sizes.some((s) => s >= 15)).toBe(true);
  });
});

describe("generateQueensFor", () => {
  for (const difficulty of DIFFICULTIES)
    it(`${difficulty}: unique, logically solved, graded and reproducible`, () => {
      const p = generateQueensFor(difficulty, 7);
      expect(p.id).toBe(`queens-${difficulty}-7`);
      expect(SIZE_FOR_DIFFICULTY[difficulty]).toContain(p.n);
      expect(validateQueensPuzzle(p)).toEqual([]);
      expect(countSolutions(p)).toBe(1);
      const res = solveLogically(p);
      expect(res.solved).toBe(true);
      expect(p.meta!.difficulty).toBe(difficulty);
      expect(p.meta!.tier).toBe(Math.max(...res.steps.map((s) => s.tier)));
      expect(p.meta!.steps).toBe(res.steps.length);
      expect(p.meta!.techniques![0]).toBe(res.steps[0]!.technique);
      // same call, same puzzle; the stored seed + style regenerates the layout
      expect(generateQueensFor(difficulty, 7)).toEqual(p);
      const again = generateQueens({ n: p.n, seed: p.meta!.seed!, style: STYLE_FOR_DIFFICULTY[difficulty] })!;
      expect(again.regions).toEqual(p.regions);
      expect(again.solution).toEqual(p.solution);
      expect(p.solution.map((col, row) => p.regions[cellAt(row, col, p.n)]).sort()).toEqual(
        Array.from({ length: p.n }, (_, i) => i),
      );
    });

  it("reports why an attempt was rejected", () => {
    const reasons = new Set<string>();
    for (let attempt = 0; attempt < 40; attempt++) {
      const res = attemptFor("hard", 1, attempt);
      reasons.add(res.ok ? "ok" : res.reason);
    }
    expect([...reasons].every((r) => ["ok", "not-unique", "too-easy", "too-hard"].includes(r))).toBe(true);
    expect(reasons.has("too-easy")).toBe(true);
  });

  it("gives up loudly when the attempt budget is too small", () => {
    expect(() => generateQueensFor("expert", 1, 0)).toThrow(/No expert/);
  });
});
