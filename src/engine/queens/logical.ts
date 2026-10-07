/**
 * Human-style queens solver: repeatedly take the easiest step any technique can find (registry
 * order, which is tier order) and apply it. Never guesses; `contradiction` only follows forced
 * placements from a single assumption.
 */
import { applyStep, findEmptyUnit, initialState, isSolved, stepChanges, type QState } from "./state";
import { QUEENS_REGISTRY } from "./techniques";
import type { QStep, QueensPuzzle } from "./types";

/** The easiest step available in this state with tier <= maxTier, or null. */
export function nextStep(state: QState, maxTier = 5): QStep | null {
  for (const t of QUEENS_REGISTRY) {
    if (t.tier > maxTier) continue;
    const step = t.find(state, maxTier);
    if (step) return step;
  }
  return null;
}

export interface LogicalResult {
  steps: QStep[];
  solved: boolean;
  state: QState;
}

/** Solve on from a given state until solved or stuck. */
export function solveFrom(start: QState, maxTier = 5): LogicalResult {
  let state = start;
  const steps: QStep[] = [];
  const limit = 2 * state.board.size;
  while (!isSolved(state) && !findEmptyUnit(state)) {
    const step = nextStep(state, maxTier);
    if (!step) break;
    if (!stepChanges(state, step)) throw new Error(`${step.technique} returned a step that changes nothing`);
    state = applyStep(state, step);
    steps.push(step);
    if (steps.length > limit) throw new Error("logical solver is not making progress");
  }
  return { steps, solved: isSolved(state), state };
}

/** Solve a puzzle from scratch with techniques up to `maxTier`. */
export function solveLogically(p: Pick<QueensPuzzle, "n" | "regions">, maxTier = 5): LogicalResult {
  return solveFrom(initialState(p), maxTier);
}
