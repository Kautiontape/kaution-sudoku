/**
 * Golden soundness for the full technique registry: on generated puzzles every placement matches
 * the true solution and no elimination ever removes the true digit. Also tracks the classic solve
 * rate and keeps hint search fast.
 */
import { exactSolve } from "../../src/engine/exact";
import { cagesFromCells, digClassic, givensRecord, makeKillerUnique, partitionCages, randomSolvedGrid } from "../../src/engine/generate";
import { templateFor } from "../../src/engine/hints/registry";
import { nextStep, solveLogically, type LogicalResult } from "../../src/engine/logical";
import { mulberry32 } from "../../src/engine/rng";
import { applyStep, cloneState, createState, type SolverState } from "../../src/engine/state";
import { TECHNIQUES } from "../../src/engine/techniques";
import { ADVANCED_TECHNIQUES } from "../../src/engine/techniques/advanced";
import type { Grid, Puzzle, Step } from "../../src/engine/types";
import { classic } from "./helpers";

const ADVANCED = new Set(ADVANCED_TECHNIQUES.map((t) => t.id));
const NAMES = /wing|fish|chain|kite|skyscraper|rectangle|colou?r|unique|bug|grave/i;

/** Replays the steps, collecting every way they could be wrong. */
function audit(p: Puzzle, truth: Grid, steps: readonly Step[], label: string): string[] {
  const bad: string[] = [];
  const s = createState(p);
  for (const st of steps) {
    const where = `${label} ${st.technique}`;
    let changes = 0;
    for (const pl of st.placements) {
      if (truth[pl.cell] !== pl.digit) bad.push(`${where}: placed ${pl.digit} at ${pl.cell}, truth ${truth[pl.cell]}`);
      if (!s.grid[pl.cell] && s.cand[pl.cell]! & (1 << pl.digit)) changes++;
    }
    for (const e of st.eliminations) {
      if (truth[e.cell] === e.digit) bad.push(`${where}: removed the true ${e.digit} at ${e.cell}`);
      if (!s.grid[e.cell] && s.cand[e.cell]! & (1 << e.digit)) changes++;
    }
    if (!changes) bad.push(`${where}: step changes nothing`);
    if (ADVANCED.has(st.technique)) {
      const text = templateFor(st.technique)(st, { puzzle: p });
      const lines = [text.where, text.what, ...text.why, text.do];
      if (lines.some((l) => !l || /undefined|NaN|null|\[object/.test(l))) bad.push(`${where}: broken text ${JSON.stringify(text)}`);
      if (NAMES.test(text.where)) bad.push(`${where}: "where" names the technique: ${text.where}`);
      const keys = (st.marks ?? []).map((m) => m.cell * 10 + m.digit);
      if (new Set(keys).size !== keys.length) bad.push(`${where}: a candidate carries two marks`);
    }
    applyStep(s, st);
  }
  return bad;
}

interface Case {
  seed: number;
  puzzle: Puzzle;
  truth: Grid;
  result: LogicalResult;
  /** Time of the first solve (includes warm-up; re-measured where it matters). */
  ms: number;
}

const CLASSIC_SEEDS = Array.from({ length: 120 }, (_, i) => 1000 + i);
let corpus: Case[] | null = null;
function classicCorpus(): Case[] {
  corpus ??= CLASSIC_SEEDS.map((seed) => {
    const rng = mulberry32(seed);
    const truth = randomSolvedGrid(rng);
    const givens = digClassic(truth, rng, { minGivens: 17 });
    const puzzle: Puzzle = { id: `c${seed}`, kind: "classic", cages: [], givens: givensRecord(givens) };
    const t0 = performance.now();
    const result = solveLogically(puzzle);
    return { seed, puzzle, truth, result, ms: performance.now() - t0 };
  });
  return corpus;
}

const hardestOf = (steps: readonly Step[]): Step => steps.reduce((a, b) => (b.rating > a.rating ? b : a));

describe("classic soundness and solve rate (120 generated puzzles)", () => {
  it("every step is sound, changes the board, and renders a clean hint", () => {
    const bad = classicCorpus().flatMap((c) => audit(c.puzzle, c.truth, c.result.steps, `seed ${c.seed}`));
    expect(bad).toEqual([]);
  });

  it("solves at least 98% with the full registry", () => {
    const cases = classicCorpus();
    const solved = cases.filter((c) => c.result.solved);
    const hardest = new Map<string, number>();
    for (const c of solved) {
      const id = hardestOf(c.result.steps).technique;
      hardest.set(id, (hardest.get(id) ?? 0) + 1);
    }
    const rate = solved.length / cases.length;
    const dist = [...hardest.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`);
    console.info(`classic solve rate ${(rate * 100).toFixed(1)}% (${solved.length}/${cases.length}); hardest: ${dist.join(", ")}`);
    expect(rate).toBeGreaterThanOrEqual(0.98);
    // The advanced techniques are what get the hard ones over the line.
    expect(solved.some((c) => c.result.steps.some((st) => st.tier >= 5))).toBe(true);
  });
});

describe("killer soundness", () => {
  it("generated killer puzzles (small cages): sound against the exact solution", () => {
    const bad: string[] = [];
    let made = 0;
    for (let seed = 200; made < 6 && seed < 240; seed++) {
      const rng = mulberry32(seed);
      const sol = randomSolvedGrid(rng);
      const lists = partitionCages(sol, rng, { sizeWeights: [0, 0.02, 0.5, 0.4, 0.08], maxSize: 4 });
      const r = makeKillerUnique(lists, sol, rng, { maxNodes: 200_000 });
      if (!r) continue;
      made++;
      const p: Puzzle = { id: `k${seed}`, kind: "killer", cages: r.cages, givens: r.givens };
      const truth = exactSolve(p).solution!;
      const res = solveLogically(p);
      bad.push(...audit(p, truth, res.steps, `killer ${seed}`));
      // Uniqueness arguments never run on killer.
      if (res.steps.some((st) => st.technique === "unique-rectangle" || st.technique === "bug-plus-one")) bad.push(`killer ${seed}: uniqueness step`);
    }
    expect(made).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  it("cage-mates count as peers: classic givens plus cages, sudoku techniques only", () => {
    // Without the cage arithmetic the advanced techniques do the heavy lifting, with cages acting
    // as extra "can't repeat" groups. Any technique that treated a cage as a strong-link house (or
    // ignored cage-mates where it shouldn't) would remove a true digit here.
    const techniques = TECHNIQUES.filter((t) => !t.killerOnly);
    const bad: string[] = [];
    const used = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const seed = 7000 + i;
      const rng = mulberry32(seed);
      const truth = randomSolvedGrid(rng);
      const givens = digClassic(truth, rng, { minGivens: 17 });
      const cages = cagesFromCells(partitionCages(truth, rng, { sizeWeights: [0, 0.02, 0.5, 0.4, 0.08], maxSize: 4 }), truth);
      const p: Puzzle = { id: `h${seed}`, kind: "killer", cages, givens: givensRecord(givens) };
      const res = solveLogically(p, { techniques });
      for (const st of res.steps) used.add(st.technique);
      bad.push(...audit(p, truth, res.steps, `hybrid ${seed}`));
    }
    expect(bad).toEqual([]);
    expect([...used].filter((id) => ADVANCED.has(id)).length).toBeGreaterThanOrEqual(5);
  });
});

/** Best of n runs, in ms. */
function timeIt(n: number, fn: () => void): number {
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    fn();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

describe("performance", () => {
  it("nextStep stays well under 50 ms, even when every technique comes up empty", () => {
    // The hardest generated puzzle, just before its hardest step.
    const cases = classicCorpus().filter((c) => c.result.solved);
    const hard = cases.reduce((a, b) => (hardestOf(b.result.steps).rating > hardestOf(a.result.steps).rating ? b : a));
    const steps = hard.result.steps;
    const at = steps.indexOf(hardestOf(steps));
    const s: SolverState = createState(hard.puzzle);
    for (const st of steps.slice(0, at)) applyStep(s, st);
    const before = timeIt(3, () => nextStep(cloneState(s)));

    // AI Escargot: the solver gets stuck, so the last nextStep runs every technique to exhaustion.
    const escargot = classic("1....7.9..3..2...8..96..5....53..9...1..8...26....4...3......1..4......7..7...3..");
    const stuck = solveLogically(escargot).state;
    const exhausted = timeIt(3, () => expect(nextStep(cloneState(stuck))).toBeNull());

    console.info(`nextStep: ${before.toFixed(1)} ms before the hardest step (${hardestOf(steps).technique}), ${exhausted.toFixed(1)} ms when stuck`);
    expect(before).toBeLessThan(50);
    expect(exhausted).toBeLessThan(50);
  });

  it("solveLogically on the slowest generated puzzles takes well under 300 ms", () => {
    const slowest = [...classicCorpus()].sort((a, b) => b.ms - a.ms).slice(0, 3);
    const times = slowest.map((c) => ({ c, ms: timeIt(3, () => solveLogically(c.puzzle)) }));
    const worst = times.reduce((a, b) => (b.ms > a.ms ? b : a));
    const steps = worst.c.result.steps;
    console.info(`solveLogically: ${worst.ms.toFixed(1)} ms for seed ${worst.c.seed} (${steps.length} steps, hardest ${hardestOf(steps).technique})`);
    expect(worst.ms).toBeLessThan(300);
  });
});
