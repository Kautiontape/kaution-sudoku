/**
 * The sudoku hint ladder (classic + killer).
 *
 * Order of concerns, so a hint always addresses what's actually blocking the player:
 *   1. solved?                      → kind "solved"
 *   2. a wrong digit on the board   → kind "mistake" (clear it)
 *   3. notes that exclude the answer → kind "notes"   (reset them) — the classic way to get stuck
 *   4. the easiest logical step from the player's state (digits + notes) → kind "step"
 *   5. nothing found                → kind "stuck"   (offer to reveal one cell)
 *
 * Hints reason from the player's notes where they exist (notes are their record of eliminations)
 * and from basic candidates elsewhere, so an elimination-only step is never "forgotten": applying
 * it writes the result into notes.
 */
import { basicCandidates } from "../candidates";
import { techniqueName } from "../catalog";
import { bit, digitsOf, popcount } from "../combos";
import { CELL_HOUSES, cellName, houseAt, houseName, PEERS } from "../geometry";
import type { HintCommon } from "../hint-types";
import { nextStep, type LogicalOptions } from "../logical";
import { createState } from "../state";
import type { CellId, Digit, Grid, Puzzle, Step } from "../types";
import { cap, cellList, plural, relation } from "./format";
import { templateFor } from "./registry";

export interface SudokuHint extends HintCommon {
  step?: Step;
  /** Cells the hint is about (wrong digits, bad notes, or a revealed cell). */
  cells?: CellId[];
  /** What the "do" rung changes for non-step hints. */
  fix?: {
    clear?: CellId[];
    resetNotes?: CellId[];
    reveal?: { cell: CellId; digit: Digit }[];
  };
}

export interface HintInput {
  puzzle: Puzzle;
  /** Current digits, givens included. */
  grid: Grid;
  /** Player notes: per-cell digit bitmask, 0 = no notes. */
  notes: ArrayLike<number>;
  /** The puzzle's solution. */
  solution: Grid;
  /** Limit the techniques a hint may use (e.g. for tests). */
  logical?: LogicalOptions;
}

const boxName = (c: CellId): string => houseName(houseAt(CELL_HOUSES[c]![2]));

function mistakeHint(input: HintInput, wrong: CellId[]): SudokuHint {
  const { grid, puzzle } = input;
  const first = wrong[0]!;
  const d = grid[first]!;
  const clash = PEERS[first]!.find((p) => grid[p] === d) ??
    puzzle.cages.find((c) => c.cells.includes(first))?.cells.find((p) => p !== first && grid[p] === d);
  const why: string[] = [];
  if (clash !== undefined)
    why.push(`${cellName(first)} is ${d}, but ${cellName(clash)} — in the ${relation(first, clash, puzzle)} — is also ${d}. A digit can't repeat there.`);
  else
    why.push(
      `${cellName(first)} = ${d} doesn't match the solution. Nothing on the board contradicts it yet, but the puzzle can't be completed around it.`,
    );
  if (wrong.length > 1) why.push(`In all, ${wrong.length} digits are wrong: ${cellList(wrong)}.`);
  return {
    kind: "mistake",
    title: wrong.length === 1 ? "A digit is wrong" : "Some digits are wrong",
    ladder: {
      where: `Something's off in ${boxName(first)}.`,
      what: wrong.length === 1 ? "One of your digits is wrong." : `${cap(String(wrong.length))} of your digits are wrong.`,
      why,
      do: `Clear ${cellList(wrong)}.`,
    },
    cells: wrong,
    fix: { clear: wrong },
  };
}

function notesHint(input: HintInput, bad: CellId[]): SudokuHint {
  const first = bad[0]!;
  const n = input.notes[first] ?? 0;
  return {
    kind: "notes",
    title: "Check your notes",
    ladder: {
      where: `Check your notes in ${boxName(first)}.`,
      what: bad.length === 1 ? "One of your notes rules out the real answer." : `${bad.length} cells' notes rule out the real answer.`,
      why: [
        `${cellName(first)}'s notes (${digitsOf(n).join(", ")}) don't include the digit that belongs there.`,
        bad.length > 1 ? `The same is true of ${cellList(bad.slice(1))}.` : "",
        `Anything you deduce from ${plural(bad.length, "that note", "those notes")} can lead you astray. Resetting ${plural(bad.length, "it", "them")} to every digit the cell can still take fixes the problem.`,
      ].filter(Boolean),
      do: `Reset the notes in ${cellList(bad)}.`,
    },
    cells: bad,
    fix: { resetNotes: bad },
  };
}

function stuckHint(input: HintInput): SudokuHint {
  const cand = basicCandidates(input.puzzle, input.grid);
  let best = -1;
  for (let c = 0; c < 81; c++) {
    if (input.grid[c]) continue;
    if (best === -1 || popcount(cand[c]!) < popcount(cand[best]!)) best = c;
  }
  const digit = input.solution[best]!;
  return {
    kind: "stuck",
    title: "No logical step found",
    ladder: {
      where: "I can't find a step with the techniques I know.",
      what: "This position needs a technique beyond the hint engine's set.",
      why: [
        "Every hint must be a deduction you could make yourself, and none of the known techniques applies here.",
        `I can reveal one cell to get you moving — ${cellName(best)}, which has the fewest options.`,
      ],
      do: `Reveal ${cellName(best)}.`,
    },
    cells: [best],
    fix: { reveal: [{ cell: best, digit }] },
  };
}

export function sudokuHint(input: HintInput): SudokuHint {
  const { puzzle, grid, notes, solution } = input;

  let filled = true;
  const wrong: CellId[] = [];
  for (let c = 0; c < 81; c++) {
    if (!grid[c]) filled = false;
    else if (grid[c] !== solution[c]) wrong.push(c);
  }
  if (wrong.length) return mistakeHint(input, wrong);
  if (filled)
    return { kind: "solved", title: "Solved!", ladder: { where: "", what: "The puzzle is complete.", why: [], do: "" } };

  const bad: CellId[] = [];
  for (let c = 0; c < 81; c++) {
    const n = notes[c] ?? 0;
    if (!grid[c] && n && !(n & bit(solution[c]!))) bad.push(c);
  }
  if (bad.length) return notesHint(input, bad);

  const state = createState(puzzle, grid, notes);
  const step = nextStep(state, input.logical);
  if (!step) return stuckHint(input);
  const ladder = templateFor(step.technique)(step, { puzzle });
  return {
    kind: "step",
    title: techniqueName(step.technique),
    technique: step.technique,
    tier: step.tier,
    ladder,
    step,
    cells: step.focus.cells,
  };
}

/** One-line description of a step (for logs, the solve-path view, and tests). */
export function stepSummary(step: Step, puzzle: Puzzle): string {
  const t = templateFor(step.technique)(step, { puzzle });
  return `${techniqueName(step.technique)}: ${t.do}`;
}

