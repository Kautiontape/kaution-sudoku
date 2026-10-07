import type { SolverState } from "../state";
import type { Step } from "../types";

/**
 * A human solving technique. `find` returns the first instance it sees in the state (deterministic
 * scan order), or null. A returned step always changes the state: at least one placement or one
 * elimination of a candidate that is currently present.
 */
export interface Technique {
  /** Technique id used in steps, the catalog, and stats (several entries may share one id). */
  id: string;
  tier: number;
  /** Base rating for ordering; individual steps may report a slightly different rating. */
  rating: number;
  /** Only meaningful for killer puzzles (needs cages). */
  killerOnly?: boolean;
  /**
   * Not valid for killer puzzles. Uniqueness patterns (unique rectangles, BUG+1) argue that a
   * digit swap would give a second solution; in killer, swapping digits can break cage sums.
   */
  classicOnly?: boolean;
  /**
   * Relies on the puzzle having exactly one solution (unique rectangles, BUG+1). Excluded when the
   * logical solver is used to *prove* uniqueness (killer generation).
   */
  assumesUnique?: boolean;
  find(s: SolverState): Step | null;
}
