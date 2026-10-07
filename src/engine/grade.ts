/**
 * Difficulty from a logical solve path. The hardest technique needed decides the tier; tiers map to
 * the four player-facing difficulties.
 */
import type { Difficulty, PuzzleKind, Step } from "./types";

export interface Grade {
  tier: number;
  rating: number;
  techniques: string[];
  counts: Record<string, number>;
  steps: number;
}

export function gradeSteps(steps: readonly Step[]): Grade {
  let tier = 0;
  let rating = 0;
  const techniques: string[] = [];
  const counts: Record<string, number> = {};
  for (const st of steps) {
    tier = Math.max(tier, st.tier);
    rating = Math.max(rating, st.rating);
    if (!(st.technique in counts)) techniques.push(st.technique);
    counts[st.technique] = (counts[st.technique] ?? 0) + 1;
  }
  return { tier, rating, techniques, counts, steps: steps.length };
}

/**
 * Player-facing difficulty for a grade.
 * Classic: tier 1 easy (singles), 2 medium (intersections, pairs), 3 hard (triples, fish, wings),
 * 4–5 expert (single-digit patterns, colouring, uniqueness, chains).
 * Killer: tier ≤ 2 easy (cage combos + singles), 3 with single-house 45s medium, multi-house 45s or
 * tier-3 sudoku techniques hard, tier 4–5 expert.
 */
export function difficultyOf(kind: PuzzleKind, g: Grade): Difficulty {
  if (kind === "classic") {
    if (g.tier <= 1) return "easy";
    if (g.tier === 2) return "medium";
    if (g.tier === 3) return "hard";
    return "expert";
  }
  if (g.tier <= 2) return "easy";
  if (g.tier === 3) return g.rating <= 3.2 ? "medium" : "hard";
  return "expert";
}
