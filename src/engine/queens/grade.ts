/**
 * Grading: what the logical solver needed, and the difficulty label that follows from it.
 *
 * Difficulty = the hardest technique tier the easiest-first solve needs:
 *
 * | difficulty | hardest tier | what it takes                                              | sizes |
 * |------------|--------------|------------------------------------------------------------|-------|
 * | easy       | 1–2          | last cell, region in a line, line in a region, simple touch | 6, 7  |
 * | medium     | 3            | mixed touch, confinement of 2 regions/lines                | 8     |
 * | hard       | 4            | confinement of 3+ regions/lines                            | 9     |
 * | expert     | 5            | contradiction (follow a forced chain)                      | 9, 10 |
 *
 * The easiest-first path is canonical: every technique stays available as cells are ruled out,
 * so no cleverer order could avoid a harder tier. Step counts grow with size (≈10 easy, ≈16
 * medium, ≈20 hard, ≈26 expert) but don't set the label. Measured on generated puzzles (see
 * scripts/queens-stats.ts): with the per-difficulty region styles in generate.ts, the share of
 * unique boards landing in each band is high enough that every band generates in well under a
 * second; generated easy puzzles also need at least one tier-2 step.
 */
import type { Difficulty } from "../types";
import type { QStep } from "./types";

export interface QueensGrade {
  /** Hardest tier used. */
  tier: number;
  /** Hardest rating used. */
  rating: number;
  difficulty: Difficulty;
  /** Distinct technique ids, in order of first use. */
  techniques: string[];
  /** Technique id -> number of steps that used it. */
  counts: Record<string, number>;
  /** Total steps. */
  steps: number;
}

export function difficultyFor(tier: number): Difficulty {
  if (tier <= 2) return "easy";
  if (tier === 3) return "medium";
  if (tier === 4) return "hard";
  return "expert";
}

export function gradeSteps(steps: readonly QStep[]): QueensGrade {
  let tier = 0;
  let rating = 0;
  const techniques: string[] = [];
  const counts: Record<string, number> = {};
  for (const s of steps) {
    tier = Math.max(tier, s.tier);
    rating = Math.max(rating, s.rating);
    if (!(s.technique in counts)) {
      techniques.push(s.technique);
      counts[s.technique] = 0;
    }
    counts[s.technique]!++;
  }
  return { tier, rating, difficulty: difficultyFor(tier), techniques, counts, steps: steps.length };
}

/** Board sizes used for each difficulty. */
export const SIZE_FOR_DIFFICULTY: Record<Difficulty, number[]> = {
  easy: [6, 7],
  medium: [8],
  hard: [9],
  expert: [9, 10],
};
