/**
 * Human-style solver: repeatedly take the easiest available technique step. Never guesses —
 * every step is a deduction a person could justify, which is what makes hints teachable and what
 * lets a full logical solve double as a proof of uniqueness.
 */
import { applyStep, createState, isBroken, isSolved, type SolverState } from "./state";
import { TECHNIQUES, type Technique } from "./techniques";
import type { Grid, Puzzle, Step } from "./types";

export interface LogicalOptions {
  /** Skip techniques above this tier. */
  maxTier?: number;
  /** Skip techniques that assume a unique solution (needed when proving uniqueness). */
  noUniqueness?: boolean;
  /** Use this technique list instead of the full registry. */
  techniques?: readonly Technique[];
  /** Safety cap on steps (default 1000). */
  maxSteps?: number;
}

export function nextStep(s: SolverState, opts: LogicalOptions = {}): Step | null {
  for (const t of opts.techniques ?? TECHNIQUES) {
    if (t.killerOnly && s.kind !== "killer") continue;
    if (opts.maxTier !== undefined && t.tier > opts.maxTier) continue;
    if (opts.noUniqueness && t.assumesUnique) continue;
    const step = t.find(s);
    if (step) return step;
  }
  return null;
}

export interface LogicalResult {
  steps: Step[];
  solved: boolean;
  /** A step left some cell with no candidates (only possible from bad input, e.g. wrong notes). */
  broken: boolean;
  state: SolverState;
}

export function solveLogically(
  p: Puzzle,
  opts: LogicalOptions & { grid?: Grid; notes?: ArrayLike<number> | null } = {},
): LogicalResult {
  return solveFrom(createState(p, opts.grid, opts.notes), opts);
}

export function solveFrom(s: SolverState, opts: LogicalOptions = {}): LogicalResult {
  const steps: Step[] = [];
  const maxSteps = opts.maxSteps ?? 1000;
  while (!isSolved(s) && steps.length < maxSteps) {
    const step = nextStep(s, opts);
    if (!step) break;
    applyStep(s, step);
    steps.push(step);
    if (isBroken(s)) return { steps, solved: false, broken: true, state: s };
  }
  return { steps, solved: isSolved(s), broken: false, state: s };
}
