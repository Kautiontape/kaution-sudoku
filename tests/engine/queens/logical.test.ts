import { mulberry32 } from "../../../src/engine/rng";
import { countSolutions } from "../../../src/engine/queens/exact";
import { generateQueens, generateQueensFor } from "../../../src/engine/queens/generate";
import { nextStep, solveLogically } from "../../../src/engine/queens/logical";
import {
  applyStep,
  cloneState,
  isSolved,
  placeQueen,
  possibleCells,
  stateFromMarks,
  stepChanges,
  unitHasQueen,
  type QState,
} from "../../../src/engine/queens/state";
import { QUEENS_REGISTRY, type ContradictionExplain, type TouchExplain } from "../../../src/engine/queens/techniques";
import { CROSS, QUEEN, type QStep, type QueensPuzzle } from "../../../src/engine/queens/types";
import { solutionCells, state, STRIPES5, UNIQUE5 } from "./fixtures";

/** Every placement is a solution cell, no elimination is. */
function expectSound(p: QueensPuzzle, step: QStep) {
  const sol = new Set(solutionCells(p));
  for (const c of step.placements) expect(sol.has(c), `${step.technique} placed a queen off the solution`).toBe(true);
  for (const c of step.eliminations) expect(sol.has(c), `${step.technique} crossed out a solution cell`).toBe(false);
}

/** Replays the explanation: each link's unit has exactly that one cell left, and the end unit none. */
function expectChainHolds(s: QState, ex: ContradictionExplain) {
  const t = cloneState(s);
  placeQueen(t, ex.cell);
  for (const link of ex.chain) {
    expect(unitHasQueen(t, link.unit)).toBe(false);
    expect(possibleCells(t, link.unit)).toEqual([link.cell]);
    placeQueen(t, link.cell);
  }
  expect(unitHasQueen(t, ex.empty)).toBe(false);
  expect(possibleCells(t, ex.empty)).toEqual([]);
}

function expectTouchHolds(s: QState, ex: TouchExplain) {
  const { attack, size } = s.board;
  expect(possibleCells(s, ex.unit)).toEqual(ex.unitCells);
  for (const x of ex.cells) for (const c of ex.unitCells) expect(attack[x * size + c]).toBe(1);
}

/** Solve step by step, checking every step against the solution and its own explanation. */
function goldenSolve(p: QueensPuzzle) {
  let s = stateFromMarks(p, new Uint8Array(p.n * p.n));
  const steps: QStep[] = [];
  for (;;) {
    const step = nextStep(s);
    if (!step) break;
    expect(stepChanges(s, step)).toBe(true);
    expectSound(p, step);
    if (step.explain.kind === "contradiction") expectChainHolds(s, step.explain as ContradictionExplain);
    if (step.explain.kind === "touch") expectTouchHolds(s, step.explain as TouchExplain);
    s = applyStep(s, step);
    steps.push(step);
  }
  return { steps, solved: isSolved(s), state: s };
}

describe("logical solver", () => {
  it("takes the easiest step first", () => {
    expect(nextStep(state(UNIQUE5))!.technique).toBe("last-cell");
    // after r1c1 there is no last cell, and region-in-line comes before touch
    expect(nextStep(state(UNIQUE5, "", "r1c1"))!.technique).toBe("region-in-line");
    expect(nextStep(state(UNIQUE5, "", "r1c1"), 1)).toBe(null);
  });

  it("solves a hand-made fixture to its solution", () => {
    const res = solveLogically(UNIQUE5);
    expect(res.solved).toBe(true);
    const placed = res.steps.flatMap((s) => s.placements).sort((a, b) => a - b);
    expect(placed).toEqual(solutionCells(UNIQUE5).sort((a, b) => a - b));
    for (const s of res.steps) expectSound(UNIQUE5, s);
  });

  it("stops without guessing when the layout has many solutions", () => {
    const res = solveLogically(STRIPES5);
    expect(res.solved).toBe(false);
    expect(res.steps).toEqual([]);
  });

  it("respects maxTier", () => {
    const res = solveLogically(UNIQUE5, 1);
    expect(res.steps.every((s) => s.tier <= 1)).toBe(true);
    expect(res.solved).toBe(false);
  });
});

describe("golden: generated puzzles", () => {
  for (let n = 6; n <= 10; n++) {
    it(`solves ${n}x${n} puzzles from 30 seeds, every step sound`, () => {
      let made = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const p = generateQueens({ n, seed });
        if (!p) continue;
        made++;
        expect(countSolutions(p)).toBe(1);
        const res = goldenSolve(p);
        expect(res.solved, `n=${n} seed=${seed} not solved`).toBe(true);
        const placed = res.steps.flatMap((s) => s.placements).sort((a, b) => a - b);
        expect(placed).toEqual(solutionCells(p).sort((a, b) => a - b));
      }
      expect(made).toBeGreaterThanOrEqual(10);
    });
  }

  it("hard and expert puzzles exercise confinement and contradiction soundly", () => {
    const seen = new Set<string>();
    for (const difficulty of ["hard", "expert"] as const)
      for (let seed = 1; seed <= 4; seed++) {
        const p = generateQueensFor(difficulty, seed);
        const res = goldenSolve(p);
        expect(res.solved).toBe(true);
        for (const s of res.steps) seen.add(`${s.technique}/${s.tier}`);
      }
    expect(seen).toContain("confinement/4");
    expect(seen).toContain("contradiction/5");
  });
});

describe("soundness on random positions", () => {
  it("every technique only removes non-solution cells and only places solution queens", () => {
    const rng = mulberry32(2024);
    let checked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const n = 6 + (seed % 5);
      const p = generateQueens({ n, seed: 1000 + seed });
      if (!p) continue;
      const sol = new Set(solutionCells(p));
      for (let k = 0; k < 6; k++) {
        // a position consistent with the solution: some solution queens, some wrong cells crossed
        const marks = new Uint8Array(n * n);
        for (let c = 0; c < n * n; c++) {
          const r = rng();
          if (sol.has(c)) marks[c] = r < 0.25 ? QUEEN : 0;
          else marks[c] = r < 0.35 ? CROSS : 0;
        }
        const s = stateFromMarks(p, marks);
        for (const t of QUEENS_REGISTRY) {
          const step = t.find(s);
          if (!step) continue;
          checked++;
          expect(stepChanges(s, step)).toBe(true);
          expectSound(p, step);
          if (step.explain.kind === "contradiction") expectChainHolds(s, step.explain as ContradictionExplain);
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
});
