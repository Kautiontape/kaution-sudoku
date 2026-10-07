/**
 * Difficulty-targeted puzzle generation for classic and killer sudoku.
 *
 * Classic: random solved grid → dig symmetric pairs while unique (exact solver) → grade with the
 * logical solver → keep if the grade matches the requested difficulty.
 *
 * Killer: random solved grid → grow cages → logical solve. A complete logical solve proves the
 * solution is unique (every step is a sound deduction, and no uniqueness-assuming technique is
 * allowed). When the solver gets stuck — either because the layout has several solutions or
 * because it's too hard — split the loosest stuck cage and try again. This keeps every generated
 * killer puzzle hintable from start to finish.
 */
import { popcount } from "./combos";
import { cagesFromCells, connectedSplits, digClassic, givensRecord, partitionCages, randomSolvedGrid } from "./generate";
import { difficultyOf, gradeSteps, type Grade } from "./grade";
import { solveLogically } from "./logical";
import { hashSeed, mulberry32, pickWeighted } from "./rng";
import type { CellId, Difficulty, Grid, Puzzle } from "./types";
import { gridToString } from "./exact";

export interface Generated {
  puzzle: Puzzle;
  grade: Grade;
  attempts: number;
}

const CLASSIC_MIN_GIVENS: Record<Difficulty, number> = { easy: 36, medium: 27, hard: 17, expert: 17 };

export function generateClassic(difficulty: Difficulty, seed: number, maxAttempts = 400): Generated | null {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = mulberry32(hashSeed("classic", difficulty, seed, attempt));
    const solution = randomSolvedGrid(rng);
    const givens = digClassic(solution, rng, { minGivens: CLASSIC_MIN_GIVENS[difficulty] });
    const puzzle: Puzzle = {
      id: `classic-${difficulty}-${seed}`,
      kind: "classic",
      cages: [],
      givens: givensRecord(givens),
      solution: gridToString(solution),
    };
    const r = solveLogically(puzzle);
    if (!r.solved || !matches(r.state.grid, solution)) continue;
    const grade = gradeSteps(r.steps);
    if (difficultyOf("classic", grade) !== difficulty) continue;
    puzzle.meta = meta(seed, difficulty, grade);
    return { puzzle, grade, attempts: attempt + 1 };
  }
  return null;
}

export interface KillerConfig {
  sizeWeights: number[];
  maxSize: number;
  /** Highest technique tier the solver may use while building the puzzle. */
  maxTier: number;
  /** Most single-cell cages allowed (they act like givens). */
  maxSingles: number;
  maxRepairs: number;
  compactness: number;
}

export const KILLER_CONFIG: Record<Difficulty, KillerConfig> = {
  easy: { sizeWeights: [0, 0, 0.5, 0.4, 0.1], maxSize: 4, maxTier: 2, maxSingles: 2, maxRepairs: 30, compactness: 0.7 },
  medium: { sizeWeights: [0, 0, 0.35, 0.4, 0.2, 0.05], maxSize: 5, maxTier: 3, maxSingles: 1, maxRepairs: 30, compactness: 0.6 },
  hard: { sizeWeights: [0, 0, 0.25, 0.35, 0.25, 0.1, 0.05], maxSize: 6, maxTier: 4, maxSingles: 0, maxRepairs: 30, compactness: 0.5 },
  expert: { sizeWeights: [0, 0, 0.2, 0.3, 0.25, 0.15, 0.1], maxSize: 6, maxTier: 5, maxSingles: 0, maxRepairs: 30, compactness: 0.4 },
};

export function generateKiller(difficulty: Difficulty, seed: number, maxAttempts = 200): Generated | null {
  const cfg = KILLER_CONFIG[difficulty];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = mulberry32(hashSeed("killer", difficulty, seed, attempt));
    const solution = randomSolvedGrid(rng);
    const lists = partitionCages(solution, rng, { sizeWeights: cfg.sizeWeights, maxSize: cfg.maxSize, compactness: cfg.compactness });
    if (lists.filter((l) => l.length === 1).length > cfg.maxSingles) continue;
    for (let repair = 0; repair <= cfg.maxRepairs; repair++) {
      const cages = cagesFromCells(lists, solution);
      const puzzle: Puzzle = { id: `killer-${difficulty}-${seed}`, kind: "killer", cages, solution: gridToString(solution) };
      const r = solveLogically(puzzle, { noUniqueness: true, maxTier: cfg.maxTier });
      if (r.solved) {
        if (!matches(r.state.grid, solution)) break; // can't happen with sound techniques
        const grade = gradeSteps(r.steps);
        if (difficultyOf("killer", grade) !== difficulty) break;
        puzzle.meta = meta(seed, difficulty, grade);
        return { puzzle, grade, attempts: attempt + 1 };
      }
      if (r.broken) break;
      if (!splitLoosest(lists, r.state.grid, r.state.cand, cfg, rng)) break;
    }
  }
  return null;
}

/** Split the stuck cage with the most open candidates. Returns false if nothing can be split. */
function splitLoosest(
  lists: CellId[][],
  grid: Grid,
  cand: Uint16Array,
  cfg: KillerConfig,
  rng: () => number,
): boolean {
  const singles = lists.filter((l) => l.length === 1).length;
  const options: { index: number; weight: number }[] = [];
  lists.forEach((cells, index) => {
    if (cells.length < 2) return;
    let open = 0;
    for (const c of cells) if (!grid[c]) open += popcount(cand[c]!) - 1;
    if (open > 0) options.push({ index, weight: open * open });
  });
  while (options.length) {
    const choice = pickWeighted(
      rng,
      options,
      options.map((o) => o.weight),
    );
    const cells = lists[choice.index]!;
    const splits = connectedSplits(cells).filter(
      ([a, b]) => singles + (a.length === 1 ? 1 : 0) + (b.length === 1 ? 1 : 0) <= cfg.maxSingles,
    );
    if (splits.length) {
      const [a, b] = splits[Math.floor(rng() * splits.length)]!;
      lists[choice.index] = a;
      lists.push(b);
      return true;
    }
    options.splice(options.indexOf(choice), 1);
  }
  return false;
}

function matches(grid: Grid, solution: Grid): boolean {
  for (let i = 0; i < 81; i++) if (grid[i] !== solution[i]) return false;
  return true;
}

function meta(seed: number, difficulty: Difficulty, g: Grade): Puzzle["meta"] {
  return {
    seed,
    difficulty,
    tier: g.tier,
    rating: g.rating,
    techniques: g.techniques,
    counts: g.counts,
    steps: g.steps,
  };
}
