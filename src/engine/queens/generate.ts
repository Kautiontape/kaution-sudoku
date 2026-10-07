/**
 * Queens generator. One attempt (`generateQueens`):
 *   1. random queen placement: one per row and column, neighbouring rows' columns at least 2 apart;
 *   2. grow n regions from the queen cells by randomized flood fill, with per-region growth
 *      weights (and a few capped "tiny" regions) for a mix of small and large regions;
 *   3. uniqueness repair (see `repairUniqueness`).
 * `generateQueensFor` retries with derived seeds until the puzzle grades to the difficulty asked.
 * All randomness comes from the seeded Rng.
 */
import { hashSeed, mulberry32, pick, pickWeighted, randRange, shuffle, type Rng } from "../rng";
import type { Difficulty } from "../types";
import { findSolutions } from "./exact";
import { cellAt, isConnected, orthogonalNeighbours, regionCells } from "./geometry";
import { gradeSteps, SIZE_FOR_DIFFICULTY, type QueensGrade } from "./grade";
import { solveLogically } from "./logical";
import type { QueensPuzzle } from "./types";

/** Knobs for region growth. */
export interface RegionStyle {
  /** Share of regions capped at 1–3 cells. */
  tinyRate: number;
  /** Growth weights the other regions pick from: bigger weight, bigger region. */
  weights: readonly number[];
  /** Frontier cells with more same-region neighbours are favoured by (count ^ compactness). */
  compactness: number;
}

/**
 * Region style per difficulty. Tiny regions hand out early queens, so easy boards get more of
 * them; harder boards grow evenly sized, looser regions, which need longer reasoning. (Measured:
 * lopsided weights such as 0.4..4 give one or two giant regions and mostly tier-1/2 puzzles.)
 * `generateQueens({ n, seed: meta.seed, style: STYLE_FOR_DIFFICULTY[meta.difficulty] })`
 * reproduces a puzzle from `generateQueensFor`.
 */
export const STYLE_FOR_DIFFICULTY: Record<Difficulty, RegionStyle> = {
  easy: { tinyRate: 0.2, weights: [0.5, 1, 1.5, 2.5], compactness: 1.5 },
  medium: { tinyRate: 0.1, weights: [0.6, 1, 1, 1.5, 2], compactness: 1 },
  hard: { tinyRate: 0.05, weights: [1, 1.25, 1.5, 2], compactness: 0.5 },
  expert: { tinyRate: 0, weights: [1, 1.5, 2], compactness: 0 },
};

/** Style when none is given: a mix of a few tiny regions and medium-to-large ones. */
export const DEFAULT_STYLE: RegionStyle = STYLE_FOR_DIFFICULTY.medium;

export interface GenerateOptions {
  n: number;
  seed: number;
  style?: RegionStyle;
}

/** Random solution: solution[row] = column, all columns distinct, neighbouring rows ≥ 2 apart. */
export function randomPlacement(rng: Rng, n: number): number[] {
  const cols = new Array<number>(n).fill(-1);
  const used = new Array<boolean>(n).fill(false);
  const rec = (row: number): boolean => {
    if (row === n) return true;
    const prev = row > 0 ? cols[row - 1]! : -10;
    for (const c of shuffle(rng, Array.from({ length: n }, (_, i) => i))) {
      if (used[c] || Math.abs(c - prev) < 2) continue;
      cols[row] = c;
      used[c] = true;
      if (rec(row + 1)) return true;
      used[c] = false;
    }
    return false;
  };
  if (!rec(0)) throw new Error(`No queen placement exists for n=${n}`);
  return cols;
}

/**
 * Grow n regions from the solution's queen cells. Region labels are shuffled so a region's index
 * says nothing about where its queen is.
 */
export function growRegions(
  rng: Rng,
  n: number,
  solution: readonly number[],
  style: RegionStyle = DEFAULT_STYLE,
): number[] {
  const size = n * n;
  const owner = new Array<number>(size).fill(-1);
  const labels = shuffle(
    rng,
    Array.from({ length: n }, (_, i) => i),
  );
  const cap: number[] = [];
  const weight: number[] = [];
  const count = new Array<number>(n).fill(1);
  for (let g = 0; g < n; g++) {
    if (rng() < style.tinyRate) {
      cap.push(randRange(rng, 1, 3));
      weight.push(1);
    } else {
      cap.push(Infinity);
      weight.push(pick(rng, style.weights));
    }
  }
  for (let r = 0; r < n; r++) owner[cellAt(r, solution[r]!, n)] = labels[r]!;

  for (let left = size - n; left > 0; left--) {
    // frontier cells of each region, weighted towards compact shapes
    const frontier: number[][] = Array.from({ length: n }, () => []);
    const fweight: number[][] = Array.from({ length: n }, () => []);
    for (let c = 0; c < size; c++) {
      if (owner[c] !== -1) continue;
      const nbs = orthogonalNeighbours(c, n);
      const seen = new Set<number>();
      for (const nb of nbs) {
        const g = owner[nb]!;
        if (g === -1 || seen.has(g)) continue;
        seen.add(g);
        const same = nbs.filter((x) => owner[x] === g).length;
        frontier[g]!.push(c);
        fweight[g]!.push(same ** style.compactness);
      }
    }
    let growable = labels.filter((g) => frontier[g]!.length > 0 && count[g]! < cap[g]!);
    if (!growable.length) growable = labels.filter((g) => frontier[g]!.length > 0);
    growable.sort((a, b) => a - b);
    const g = pickWeighted(
      rng,
      growable,
      growable.map((x) => weight[x]!),
    );
    const c = pickWeighted(rng, frontier[g]!, fweight[g]!);
    owner[c] = g;
    count[g]!++;
  }
  return owner;
}

/** Can c leave its region without splitting it? */
const canLeave = (regions: readonly number[], n: number, c: number): boolean =>
  isConnected(
    regionCells(regions, regions[c]!).filter((x) => x !== c),
    n,
  );

/**
 * Make the layout unique for `solution`. While another solution exists, move one of its queen
 * cells (never one of ours) into a neighbouring region, keeping regions connected: its old region
 * loses that solution's queen, so that solution dies and ours stays valid. When every such cell is
 * stuck (inside its region, or holding it together), first move a same-region neighbour of one of
 * them into another region so it can move next time; failing that, try the next other solution.
 * Mutates `regions`; false if it gives up.
 */
export function repairUniqueness(
  rng: Rng,
  n: number,
  regions: number[],
  solution: readonly number[],
  maxMoves = 8 * n,
): boolean {
  const ours = new Set(solution.map((col, r) => cellAt(r, col, n)));
  const addMove = (moves: [number, number][], c: number, to: number) => {
    if (!moves.some(([mc, mt]) => mc === c && mt === to)) moves.push([c, to]);
  };
  const movesAgainst = (other: readonly number[]): [number, number][] => {
    const theirs = other.map((col, r) => cellAt(r, col, n)).filter((c) => !ours.has(c));
    const moves: [number, number][] = [];
    for (const c of theirs) {
      if (!canLeave(regions, n, c)) continue;
      for (const nb of orthogonalNeighbours(c, n)) if (regions[nb] !== regions[c]) addMove(moves, c, regions[nb]!);
    }
    if (moves.length) return moves;
    for (const c of theirs)
      for (const d of orthogonalNeighbours(c, n)) {
        if (ours.has(d) || regions[d] !== regions[c] || !canLeave(regions, n, d)) continue;
        for (const e of orthogonalNeighbours(d, n)) if (regions[e] !== regions[d]) addMove(moves, d, regions[e]!);
      }
    return moves;
  };
  const isOurs = (s: readonly number[]) => s.every((c, r) => c === solution[r]);
  for (let move = 0; move <= maxMoves; move++) {
    const sols = findSolutions({ n, regions }, 2);
    if (sols.length < 2) return sols.length === 1;
    let moves = movesAgainst(sols.find((s) => !isOurs(s))!);
    if (!moves.length)
      for (const other of findSolutions({ n, regions }, 6).slice(2)) {
        if (isOurs(other)) continue;
        moves = movesAgainst(other);
        if (moves.length) break;
      }
    if (!moves.length) return false;
    const [c, to] = pick(rng, moves);
    regions[c] = to;
  }
  return false;
}

/** One attempt: a unique puzzle of size n, or null if the uniqueness repair gave up. */
export function generateQueens({ n, seed, style }: GenerateOptions): QueensPuzzle | null {
  const rng = mulberry32(seed);
  const solution = randomPlacement(rng, n);
  const regions = growRegions(rng, n, solution, style);
  if (!repairUniqueness(rng, n, regions, solution)) return null;
  return { id: `queens-${n}-${seed}`, n, regions, solution, meta: { seed } };
}

/** Hardest tier allowed for each difficulty (the solver gives up early above it). */
const MAX_TIER: Record<Difficulty, number> = { easy: 2, medium: 3, hard: 4, expert: 5 };

export type AttemptResult =
  | { ok: true; puzzle: QueensPuzzle; grade: QueensGrade }
  | { ok: false; reason: "not-unique" | "too-hard" | "too-easy" };

/**
 * Attempt number `attempt` of `generateQueensFor(difficulty, seed)`: the size and the seed of the
 * attempt are derived from (difficulty, seed, attempt). Easy puzzles must need at least one
 * tier-2 step (a board solved by last cells alone is too trivial to teach anything).
 */
export function attemptFor(difficulty: Difficulty, seed: number, attempt: number): AttemptResult {
  const sub = hashSeed("queens", difficulty, seed, attempt);
  const sizes = SIZE_FOR_DIFFICULTY[difficulty];
  const n = sizes[sub % sizes.length]!;
  const p = generateQueens({ n, seed: sub, style: STYLE_FOR_DIFFICULTY[difficulty] });
  if (!p) return { ok: false, reason: "not-unique" };
  const res = solveLogically(p, MAX_TIER[difficulty]);
  if (!res.solved) return { ok: false, reason: "too-hard" };
  const grade = gradeSteps(res.steps);
  if (grade.difficulty !== difficulty || grade.tier < 2) return { ok: false, reason: "too-easy" };
  const puzzle: QueensPuzzle = {
    ...p,
    id: `queens-${difficulty}-${seed}`,
    meta: {
      seed: sub,
      tier: grade.tier,
      rating: grade.rating,
      difficulty,
      techniques: grade.techniques,
      counts: grade.counts,
      steps: grade.steps,
    },
  };
  return { ok: true, puzzle, grade };
}

/**
 * A puzzle that is unique, fully solved by `solveLogically`, and grades to `difficulty`.
 * Retries with derived seeds; deterministic per (difficulty, seed).
 */
export function generateQueensFor(difficulty: Difficulty, seed: number, maxAttempts = 3000): QueensPuzzle {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = attemptFor(difficulty, seed, attempt);
    if (res.ok) return res.puzzle;
  }
  throw new Error(`No ${difficulty} queens puzzle found for seed ${seed} in ${maxAttempts} attempts`);
}
