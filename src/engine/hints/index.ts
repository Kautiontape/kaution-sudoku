/**
 * The sudoku hint ladder (classic + killer).
 *
 * Order of concerns, so a hint always addresses what's actually blocking the player:
 *   1. solved?                         → kind "solved"
 *   2. a wrong digit on the board      → kind "mistake" (clear it)
 *   3. a note that's impossible        → kind "notes"   (take that digit out of the notes)
 *   4. the next digit you can know     → kind "step"    (place it)
 *   5. nothing found                   → kind "stuck"   (offer to reveal one cell)
 *
 * Hints reason from the board, never from the player's notes: notes say what a cell might be, not
 * everything it can be, so a note that merely leaves out the answer isn't a mistake. Only a note
 * that's impossible — the digit is already in its row, column, box or cage, or no combination of
 * its cage's sum uses it — gets flagged.
 *
 * Every step hint places a digit. The solver looks ahead a few placements and picks the one that
 * needs the fewest narrowing steps first (most need none: a single, or a 45-rule sum); when some
 * are needed, the hint walks through just those, then shows how you know the digit, with a nudge
 * that notes would have shown it. When the digit is further off, a hint teaches a round of
 * narrowing steps toward it, and applying it pencils in what they leave (`hintMarks` says where).
 */
import { basicCandidates, comboCandidates } from "../candidates";
import { techniqueName } from "../catalog";
import { digitsOf, popcount } from "../combos";
import { CELL_HOUSES, cellName, houseAt, houseIndex, houseName, HOUSE_CELLS, PEERS } from "../geometry";
import type { HintCommon, LadderText } from "../hint-types";
import { nextStep, type LogicalOptions } from "../logical";
import { TECHNIQUES } from "../techniques";
import type { Technique } from "../techniques/types";
import { cageView } from "../techniques/killer";
import { applyStep, cloneState, createState, isBroken, type SolverState } from "../state";
import { puzzleKind, type CandidateMark, type CellId, type Digit, type Grid, type House, type Puzzle, type Step } from "../types";
import { aDigit, asClause, cageName, cap, cellList, comboList, maskList, numberWord, relation } from "./format";
import { templateFor } from "./registry";

export interface SudokuHint extends HintCommon {
  /** The step that places the digit. */
  step?: Step;
  /** Narrowing steps it needs first, in order (eliminations only). */
  prior?: Step[];
  /** Cells the hint is about (wrong digits, impossible notes, or a revealed cell). */
  cells?: CellId[];
  /** What the "do" rung changes for non-step hints. */
  fix?: {
    clear?: CellId[];
    /** Digits to take out of a cell's notes (bitmask). */
    removeNotes?: { cell: CellId; mask: number }[];
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
  /**
   * Candidates earlier hints have already ruled out (bitmask per cell). Kept by the game, not in
   * the player's notes, so a hint that only narrows things down isn't forgotten by the next one.
   */
  known?: ArrayLike<number>;
}

/** Where hints reason from: the board, minus what earlier hints have ruled out. */
function boardState(input: HintInput): ReturnType<typeof createState> {
  const s = createState(input.puzzle, input.grid);
  if (input.known)
    for (let c = 0; c < 81; c++) {
      const narrowed = s.cand[c]! & ~(input.known[c] ?? 0);
      if (narrowed) s.cand[c] = narrowed;
    }
  return s;
}

/**
 * The candidates a hint pencils onto the board: what Auto notes would give (cage sums applied, in
 * killer), minus what earlier hints have ruled out. Never a digit the notes check would flag.
 */
export function shownCandidates(puzzle: Puzzle, grid: Grid, known?: ArrayLike<number>): Uint16Array {
  const cand = puzzleKind(puzzle) === "killer" ? comboCandidates(puzzle, grid) : basicCandidates(puzzle, grid);
  if (known)
    for (let c = 0; c < 81; c++) {
      const left = cand[c]! & ~(known[c] ?? 0);
      if (left) cand[c] = left;
    }
  return cand;
}

/**
 * The candidates a step hint marks, one role each: every step it walks through, in order, with its
 * eliminations struck (a later step's role wins, but a struck candidate stays struck). Their squares
 * are the only ones the hint pencils. "digit" marks are left out: they point out where else a digit
 * can go, which is no reason to pencil a square.
 */
export function hintMarks(hint: Pick<SudokuHint, "step" | "prior">): CandidateMark[] {
  const out = new Map<number, CandidateMark>();
  for (const s of hint.step ? [...(hint.prior ?? []), hint.step] : []) {
    const struck = s.eliminations.map((e): CandidateMark => ({ cell: e.cell, digit: e.digit, role: "elim" }));
    for (const m of [...(s.marks ?? []), ...struck]) {
      if (m.role === "digit") continue;
      const k = pair(m.cell, m.digit);
      if (out.get(k)?.role !== "elim") out.set(k, { cell: m.cell, digit: m.digit, role: m.role });
    }
  }
  return [...out.values()];
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

interface BadNote {
  cell: CellId;
  mask: number;
}

/**
 * Notes that are impossible, not just incomplete: the digit is already in the cell's row, column,
 * box or cage, or (killer) no combination of the cage's sum uses it.
 */
function impossibleNotes(input: HintInput): BadNote[] {
  const { puzzle, grid, notes } = input;
  const legal = basicCandidates(puzzle, grid);
  if (puzzle.cages.length) {
    const s = createState(puzzle, grid);
    for (const cage of puzzle.cages) {
      const allowed = cageView(s, cage).combos.reduce((m, x) => m | x, 0);
      for (const c of cage.cells) legal[c]! &= allowed;
    }
  }
  const out: BadNote[] = [];
  for (let c = 0; c < 81; c++) {
    const bad = grid[c] ? 0 : (notes[c] ?? 0) & ~legal[c]! & 0x3fe;
    if (bad) out.push({ cell: c, mask: bad });
  }
  return out;
}

/** Why `d` can't go in `cell`: a digit it sees, or its cage's sum. */
function whyImpossible(input: HintInput, cell: CellId, d: Digit): string {
  const { puzzle, grid } = input;
  const cage = puzzle.cages.find((x) => x.cells.includes(cell));
  const clash = PEERS[cell]!.find((q) => grid[q] === d) ?? cage?.cells.find((q) => q !== cell && grid[q] === d);
  if (clash !== undefined) return `${cellName(clash)} — in the ${relation(cell, clash, puzzle)} — is already ${d}`;
  if (cage) {
    const v = cageView(createState(puzzle, grid), cage);
    const ways = comboList(v.combos, "or");
    return v.placed.length
      ? `the rest of ${cageName(puzzle, cage.id)} has to make ${v.rem}: ${ways}, and none of those uses ${aDigit(d)}`
      : `${cageName(puzzle, cage.id)} can only be ${ways}, and none of those uses ${aDigit(d)}`;
  }
  return `${aDigit(d)} can't go there`;
}

function impossibleNotesHint(input: HintInput, bad: BadNote[]): SudokuHint {
  const first = bad[0]!;
  const d = digitsOf(first.mask)[0]! as Digit;
  const single = bad.length === 1 && popcount(first.mask) === 1;
  const others = bad.flatMap((b) => digitsOf(b.mask).map((x) => ({ cell: b.cell, d: x as Digit }))).slice(1);
  const why = [`${cellName(first.cell)} has ${aDigit(d)} pencilled in, but ${whyImpossible(input, first.cell, d)}.`];
  if (others.length)
    why.push(`Also: ${others.map((o) => `${o.d} in ${cellName(o.cell)} (${whyImpossible(input, o.cell, o.d)})`).join("; ")}.`);
  why.push("The rest of your notes are fine — notes are for what a cell might be, so they never have to be complete.");
  return {
    kind: "notes",
    title: single ? "A note can't be right" : "Some notes can't be right",
    ladder: {
      where: `Check your notes in ${boxName(first.cell)}.`,
      what: single ? "One of your notes can't be right." : "A few of your notes can't be right.",
      why,
      do: single
        ? `Remove ${d} from ${cellName(first.cell)}'s notes.`
        : `Remove ${bad.map((b) => `${digitsOf(b.mask).join(" and ")} from ${cellName(b.cell)}`).join("; ")} in your notes.`,
    },
    cells: bad.map((b) => b.cell),
    fix: { removeNotes: bad },
  };
}

// ------------------------------------------------------------------------------------------
// Looking ahead to the next placement

const ALL: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
/** Look ahead this far for placements to choose from. */
const LOOKAHEAD_PLACEMENTS = 12;
/** Techniques that can place a digit straight off the board — no narrowing first. */
const DIRECT = new Set(["full-house", "naked-single", "hidden-single", "cage-last-cell", "innies-outies"]);
const LOOKAHEAD_STEPS = 400;

/** Candidates are tracked as cell * 10 + digit. */
const pair = (c: CellId, d: number) => c * 10 + d;

/** Cells a step's reasoning covers: what it looks at, its pattern, its cages. */
function supportCells(step: Step, p: Puzzle): Set<CellId> {
  const out = new Set<CellId>([...step.focus.cells, ...(step.sources ?? []), ...step.placements.map((x) => x.cell)]);
  for (const h of step.focus.houses) for (const c of HOUSE_CELLS[houseIndex(h)]!) out.add(c);
  for (const id of step.focus.cages) for (const c of p.cages.find((x) => x.id === id)?.cells ?? []) out.add(c);
  for (const m of step.marks ?? []) out.add(m.cell);
  for (const vc of step.virtualCages ?? []) for (const c of vc.cells) out.add(c);
  return out;
}

/** Placements read off sums and placed digits rather than candidates. */
const ARITHMETIC = new Set(["full-house", "cage-last-cell", "innies-outies"]);

/** Steps that read only sums and placed digits: no candidates (but placed digits, see below). */
function arithmetic(step: Step, final: boolean): boolean {
  const ex = step.explain as { kind?: string; basis?: string };
  if (ex.kind === "cage-combos" && ex.basis === "sum") return true; // "a 3-cell 7 cage is 1+2+4"
  return final && !!ex.kind && ARITHMETIC.has(ex.kind);
}

/** The candidates a step's conclusion relies on being gone (or present). */
function reads(step: Step, p: Puzzle, final: boolean): number[] {
  const ex = step.explain as { kind?: string; cell?: CellId; digit?: unknown; house?: House; cage?: number };
  if (arithmetic(step, final)) return [];
  // Locked inside a cage: reads the cage's own cells (its valid combos, where the digit can go).
  if (ex.kind === "cage-locked")
    return (p.cages.find((c) => c.id === ex.cage)?.cells ?? []).flatMap((c) => ALL.map((d) => pair(c, d)));
  if (final) {
    if (ex.kind === "hidden-single" && ex.house)
      return HOUSE_CELLS[houseIndex(ex.house)]!.filter((c) => c !== ex.cell).map((c) => pair(c, ex.digit as number));
    if (ex.kind === "naked-single" && ex.cell !== undefined) return ALL.filter((d) => d !== ex.digit).map((d) => pair(ex.cell!, d));
  }
  const digits = typeof ex.digit === "number" ? [ex.digit] : ALL;
  return [...supportCells(step, p)].flatMap((c) => digits.map((d) => pair(c, d)));
}

/** The candidates a step takes away — a placement takes its digit from every cell it sees. */
function removes(step: Step, p: Puzzle): number[] {
  const out = step.eliminations.map((e) => pair(e.cell, e.digit));
  for (const pl of step.placements) {
    for (const d of ALL) if (d !== pl.digit) out.push(pair(pl.cell, d));
    for (const q of PEERS[pl.cell]!) out.push(pair(q, pl.digit));
    for (const q of p.cages.find((c) => c.cells.includes(pl.cell))?.cells ?? []) if (q !== pl.cell) out.push(pair(q, pl.digit));
  }
  return out;
}

/**
 * The earlier steps the placement at `i` actually depends on, in order — or null if it depends on
 * an earlier placement (then it isn't the next digit to find).
 */
function dependencies(steps: readonly Step[], i: number, p: Puzzle): Step[] | null {
  // Arithmetic steps read placed digits: if the look-ahead itself filled any cell one adds up,
  // that step isn't something the board shows yet.
  const placedBefore = (k: number, step: Step) => {
    const cells = supportCells(step, p);
    return steps.slice(0, k).some((s) => s.placements.some((pl) => cells.has(pl.cell)));
  };
  const final = steps[i]!;
  if (arithmetic(final, true) && placedBefore(i, final)) return null;
  const need = new Set(reads(final, p, true));
  const kept: Step[] = [];
  for (let j = i - 1; j >= 0; j--) {
    const s = steps[j]!;
    if (!removes(s, p).some((x) => need.has(x))) continue;
    if (s.placements.length || (arithmetic(s, false) && placedBefore(j, s))) return null;
    kept.unshift(s);
    for (const x of reads(s, p, false)) need.add(x);
  }
  return kept;
}

/** Whether `t` may run for this puzzle under these options (as the logical solver decides). */
function usable(t: Technique, kind: string, o: LogicalOptions = {}): boolean {
  if (o.techniques && !o.techniques.includes(t)) return false;
  if (t.killerOnly && kind !== "killer") return false;
  if (t.classicOnly && kind !== "classic") return false;
  if (o.maxTier !== undefined && t.tier > o.maxTier) return false;
  return !(o.noUniqueness && t.assumesUnique);
}

/** The digit that's quickest to know from the board: its placing step and the steps it needs. */
function nextPlacement(input: HintInput): { step: Step; prior: Step[] } | null {
  // A digit you can place straight off the board needs no narrowing at all — even a 45-rule sum
  // the step-by-step solver would only reach after lots of cheaper eliminations.
  const s0 = boardState(input);
  for (const t of TECHNIQUES) {
    if (!DIRECT.has(t.id) || !usable(t, s0.kind, input.logical)) continue;
    const step = t.find(s0);
    if (step?.placements.length) return { step, prior: [] };
  }
  const s = boardState(input);
  const steps: Step[] = [];
  let found = 0;
  for (let k = 0; k < LOOKAHEAD_STEPS && found < LOOKAHEAD_PLACEMENTS; k++) {
    const step = nextStep(s, input.logical);
    if (!step) break;
    steps.push(step);
    applyStep(s, step);
    if (step.placements.length) found++;
    if (isBroken(s)) break;
  }
  let best: { step: Step; prior: Step[] } | null = null;
  steps.forEach((step, i) => {
    if (!step.placements.length) return;
    const prior = dependencies(steps, i, input.puzzle);
    if (prior && (!best || prior.length < best.prior.length)) best = { step, prior };
  });
  return best;
}

/** The most narrowing steps one hint walks through; longer routes are taught in rounds this size. */
const MAX_CHAIN = 3;

/**
 * What a step leaves, as facts: "r4c3, r4c4 and r4c5 can only be 1, 2 or 4; r9c1 can't be 7" —
 * whichever reads shorter per cell. `before` is the candidates just before the step.
 */
function narrowed(eliminations: readonly { cell: CellId; digit: number }[], before: ArrayLike<number>): string {
  const removed = new Map<CellId, number>();
  for (const e of eliminations) removed.set(e.cell, (removed.get(e.cell) ?? 0) | (1 << e.digit));
  const groups = new Map<string, CellId[]>();
  for (const [c, gone] of [...removed].sort((a, b) => a[0] - b[0])) {
    const left = (before[c] ?? 0) & ~gone;
    const key = left && popcount(left) <= popcount(gone) ? `only:${left}` : `not:${gone}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups]
    .map(([key, cells]) => {
      const [kind, mask] = key.split(":");
      return `${cellList(cells)} ${kind === "only" ? "can only be" : "can't be"} ${maskList(Number(mask), "or")}`;
    })
    .join("; ");
}

/** Walk steps from `start`, giving each one's "So …" facts. */
function walk(start: SolverState, steps: readonly Step[]): string[] {
  const s = cloneState(start);
  return steps.map((step) => {
    const text = narrowed(step.eliminations, Uint16Array.from(s.cand));
    applyStep(s, step);
    return text;
  });
}

/** "First, look at the 7 cage at r4c3: … So r4c3, r4c4 and r4c5 can only be 1, 2 or 4." */
function narrowingParagraphs(start: SolverState, steps: readonly Step[], puzzle: Puzzle): string[] {
  const facts = walk(start, steps);
  return steps.map((s, i) => {
    const t = templateFor(s.technique)(s, { puzzle });
    return `${i === 0 ? "First" : "Then"}, ${asClause(t.where)}: ${t.why.join(" ")} So ${facts[i]}.`;
  });
}

/**
 * When the nearest digit is a long way off: teach the first few steps toward it (a round of up to
 * MAX_CHAIN). Applying it pencils in what they leave, and the game remembers what they rule out
 * (HintInput.known), so the next hint picks up from there.
 */
function steppingStone(start: SolverState, route: readonly Step[], goal: Step, puzzle: Puzzle): SudokuHint {
  const round = route.slice(0, MAX_CHAIN);
  const first = templateFor(round[0]!.technique)(round[0]!, { puzzle });
  const target = cellName(goal.placements[0]!.cell);
  const why = round.length === 1 ? [...first.why, `So ${walk(start, round)[0]}.`] : narrowingParagraphs(start, round, puzzle);
  why.push(
    `Nothing can be placed straight from the board yet: ${round.length === 1 ? "this is" : "these are"} the way in toward ${target}. Pencil ${round.length === 1 ? "it" : "them"} in, and the next hint picks up from there.`,
  );
  return {
    kind: "step",
    title: techniqueName(round[0]!.technique),
    technique: round[0]!.technique,
    tier: Math.max(...round.map((x) => x.tier)),
    ladder: {
      where: first.where,
      what: `${first.what} ${round.length === 1 ? "It's a step" : `${cap(numberWord(round.length))} steps`} on the way to ${target}.`,
      why,
      do: `Pencil it in: ${narrowed(round.flatMap((x) => x.eliminations), start.cand)}.`,
      ...(round.length > 1 ? { steps: round.length } : {}),
    },
    step: round[round.length - 1]!,
    prior: round.slice(0, -1),
    cells: round[0]!.focus.cells,
  };
}

/** One digit-placing step, with the narrowing it needs first walked through. */
function chainLadder(start: SolverState, prior: readonly Step[], step: Step, puzzle: Puzzle): LadderText {
  const fin = templateFor(step.technique)(step, { puzzle });
  if (!prior.length) return fin;
  const why = narrowingParagraphs(start, prior, puzzle);
  // The singles say "ruled out by earlier deductions": here those are the steps just shown.
  const above = prior.length === 1 ? "by the step above" : "by the steps above";
  why.push(`${prior.length === 1 ? "With that" : "With those"} ruled out, ${asClause(fin.where)}: ${fin.why.join(" ").replaceAll("by earlier deductions", above)}`);
  why.push(notesNudge(step));
  return {
    where: fin.where,
    what: `${fin.what} ${prior.length === 1 ? "One narrowing step gets you there." : `${cap(numberWord(prior.length))} narrowing steps get you there.`}`,
    why,
    do: fin.do,
    steps: prior.length,
  };
}

/** How notes would have made a chained hint visible at a glance. */
function notesNudge(step: Step): string {
  const ex = step.explain as { kind?: string; cell?: CellId; digit?: number; house?: House };
  if (ex.kind === "hidden-single" && ex.house)
    return `Notes make this easy to see: with the options pencilled in and those crossed out, ${aDigit(ex.digit!)} has just one place left in ${houseName(ex.house)}.`;
  if (ex.kind === "naked-single" && ex.cell !== undefined)
    return `Notes make this easy to see: with ${cellName(ex.cell)}'s options pencilled in and those crossed out, only ${ex.digit} is left.`;
  return "Notes make chains like this easy to follow: pencil in what each cell can be and cross out as you go.";
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
  const { puzzle, grid, solution } = input;

  let filled = true;
  const wrong: CellId[] = [];
  for (let c = 0; c < 81; c++) {
    if (!grid[c]) filled = false;
    else if (grid[c] !== solution[c]) wrong.push(c);
  }
  if (wrong.length) return mistakeHint(input, wrong);
  if (filled)
    return { kind: "solved", title: "Solved!", ladder: { where: "", what: "The puzzle is complete.", why: [], do: "" } };

  const bad = impossibleNotes(input);
  if (bad.length) return impossibleNotesHint(input, bad);

  const next = nextPlacement(input);
  if (!next) return stuckHint(input);
  const { step, prior } = next;
  const start = boardState(input);
  if (prior.length > MAX_CHAIN) return steppingStone(start, prior, step, puzzle);
  return {
    kind: "step",
    title: techniqueName(step.technique),
    technique: step.technique,
    tier: Math.max(step.tier, ...prior.map((s) => s.tier)),
    ladder: chainLadder(start, prior, step, puzzle),
    step,
    prior,
    cells: step.focus.cells,
  };
}

/** One-line description of a step (for logs, the solve-path view, and tests). */
export function stepSummary(step: Step, puzzle: Puzzle): string {
  const t = templateFor(step.technique)(step, { puzzle });
  return `${techniqueName(step.technique)}: ${t.do}`;
}

