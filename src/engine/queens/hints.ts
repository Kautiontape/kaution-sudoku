/**
 * Queens hints: the four-rung ladder (where / what / why / do) built only from templates over
 * structured data (the puzzle, the player's marks and `QStep.explain`). Every user-facing string
 * for queens hints lives in this file.
 *
 * Order: solved → misplaced queen ("mistake") → X on a solution cell ("notes") → the easiest
 * logical step ("step") → "stuck".
 */
import type { HintCommon, LadderText } from "../hint-types";
import { queensTechniqueInfo } from "./catalog";
import { cellAt, cellName, colOf, makeBoard, rowOf, touching, unitCells, type QBoard } from "./geometry";
import { nextStep } from "./logical";
import { findEmptyUnit, stateFromMarks } from "./state";
import type {
  ConfinementExplain,
  ContradictionExplain,
  LastCellExplain,
  LineInRegionExplain,
  QExplain,
  RegionInLineExplain,
  TouchExplain,
} from "./techniques";
import { CROSS, QUEEN, type Marks, type QCell, type QStep, type QueensPuzzle, type Unit } from "./types";

/** The UI's colour name for region i, as a bare word ("purple"). Templates add "the … region". */
export interface RegionNamer {
  region(i: number): string;
}

export interface QueensHint extends HintCommon {
  /** kind "step": the step the ladder explains. */
  step?: QStep;
  /** kind "mistake": misplaced queens; kind "notes": crosses on solution cells. */
  wrongCells?: QCell[];
}

// ---------------------------------------------------------------------------------------------
// Wording helpers

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
const numberWord = (k: number): string => NUMBER_WORDS[k] ?? String(k);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "a", "a and b", "a, b and c" (or with "or"). */
function join(items: readonly string[], conj = "and"): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${conj} ${items[items.length - 1]}`;
}

class Words {
  readonly n: number;
  constructor(
    readonly board: QBoard,
    private readonly names?: RegionNamer,
  ) {
    this.n = board.n;
  }
  cell(c: QCell): string {
    return cellName(c, this.n);
  }
  cells(cs: readonly QCell[], conj = "and"): string {
    const names = cs.map((c) => this.cell(c));
    return join(names, conj);
  }
  /** "the purple region" with a namer, "region 3" without. */
  region(i: number): string {
    return this.names ? `the ${this.names.region(i)} region` : `region ${i + 1}`;
  }
  /** "the purple and green regions" with a namer, "regions 2 and 5" without. */
  regions(is: readonly number[], conj = "and"): string {
    if (is.length === 1) return this.region(is[0]!);
    const names = this.names;
    if (names) return `the ${join(is.map((i) => names.region(i)), conj)} regions`;
    return `regions ${join(is.map((i) => String(i + 1)), conj)}`;
  }
  /** "rows 3 and 4", "column 2". */
  lines(type: "row" | "col", is: readonly number[], conj = "and"): string {
    const noun = type === "row" ? "row" : "column";
    const numbers = is.map((i) => String(i + 1));
    return `${noun}${is.length > 1 ? "s" : ""} ${join(numbers, conj)}`;
  }
  unit(u: Unit): string {
    return u.type === "region" ? this.region(u.index) : this.lines(u.type, [u.index]);
  }
  /** "the purple region's", "row 3's". */
  unitPossessive(u: Unit): string {
    return `${this.unit(u)}'s`;
  }
}

const nounOf = (u: Unit): string => (u.type === "row" ? "row" : u.type === "col" ? "column" : "region");
const plural = (k: number, one: string, many: string): string => (k === 1 ? one : many);

function nameOf(technique: string): string {
  return queensTechniqueInfo(technique)?.name ?? technique;
}

// ---------------------------------------------------------------------------------------------
// Step ladders

/** The four rungs for a logical step. */
export function stepText(step: QStep, p: QueensPuzzle, names?: RegionNamer): LadderText {
  const w = new Words(makeBoard(p), names);
  const ex = step.explain as QExplain;
  switch (ex.kind) {
    case "last-cell":
      return lastCellText(ex, w);
    case "region-in-line":
      return regionInLineText(ex, step, w);
    case "line-in-region":
      return lineInRegionText(ex, step, w);
    case "touch":
      return touchText(ex, w);
    case "confinement":
      return confinementText(ex, step, w);
    case "contradiction":
      return contradictionText(ex, w);
    default:
      return genericText(step, w);
  }
}

function lastCellText(ex: LastCellExplain, w: Words): LadderText {
  const U = w.unit(ex.unit);
  const C = w.cell(ex.cell);
  const alone = unitCells(w.board, ex.unit).length === 1;
  return {
    where: `Look at ${U}.`,
    what: `${nameOf("last-cell")}: ${U} has only one place left for its queen.`,
    why: alone
      ? [`${cap(U)} is a single cell, ${C}.`, `Every region needs exactly one queen, so its queen has to go on ${C}.`]
      : [
          `Every ${nounOf(ex.unit)} needs exactly one queen.`,
          `All the other cells of ${U} are ruled out: each one is crossed out, touches a queen, or shares a row, column or region with a queen.`,
          `That leaves ${C} as the only place for ${w.unitPossessive(ex.unit)} queen.`,
        ],
    do: `Place a queen on ${C}.`,
  };
}

function regionInLineText(ex: RegionInLineExplain, step: QStep, w: Words): LadderText {
  const R = w.region(ex.region);
  const L = w.unit(ex.line);
  return {
    where: `Look at ${R}.`,
    what: `${nameOf("region-in-line")}: all of ${R}'s open cells are in one ${nounOf(ex.line)}.`,
    why: [
      `${cap(R)}'s remaining cells (${w.cells(ex.cells)}) are all in ${L}.`,
      `Its queen has to be one of them, so ${L}'s queen will come from ${R}.`,
      `${cap(L)} can only have one queen, so no other cell in ${L} can hold a queen.`,
    ],
    do: `Cross out ${w.cells(step.eliminations)}.`,
  };
}

function lineInRegionText(ex: LineInRegionExplain, step: QStep, w: Words): LadderText {
  const R = w.region(ex.region);
  const L = w.unit(ex.line);
  return {
    where: `Look at ${L}.`,
    what: `${nameOf("line-in-region")}: every open cell of ${L} is in the same region.`,
    why: [
      `${cap(L)}'s remaining cells (${w.cells(ex.cells)}) are all in ${R}.`,
      `${cap(L)} needs a queen, so ${R}'s one queen must be in ${L}.`,
      `That rules out the rest of ${R}.`,
    ],
    do: `Cross out ${w.cells(step.eliminations)}.`,
  };
}

/** How a queen on x rules out each target cell: "touch r3c4 and share column 6 with r5c6". */
function attackPhrase(x: QCell, targets: readonly QCell[], w: Words): string {
  const { n, regions } = w.board;
  const groups = new Map<string, QCell[]>();
  const add = (key: string, c: QCell) => groups.set(key, [...(groups.get(key) ?? []), c]);
  for (const c of targets) {
    if (touching(x, c, n)) add("touch", c);
    else if (rowOf(x, n) === rowOf(c, n)) add("row", c);
    else if (colOf(x, n) === colOf(c, n)) add("col", c);
    else add("region", c);
  }
  const parts: string[] = [];
  for (const key of ["touch", "row", "col", "region"]) {
    const cs = groups.get(key);
    if (!cs) continue;
    if (key === "touch") parts.push(`touch ${w.cells(cs)}`);
    else if (key === "row") parts.push(`share row ${rowOf(x, n) + 1} with ${w.cells(cs)}`);
    else if (key === "col") parts.push(`share column ${colOf(x, n) + 1} with ${w.cells(cs)}`);
    else parts.push(`share ${w.region(regions[x]!)} with ${w.cells(cs)}`);
  }
  // when a clause lists several cells it already has an "and": "touch a and b, and share …"
  if (parts.length > 1 && [...groups.values()].some((cs) => cs.length > 1))
    return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
  return join(parts);
}

function touchText(ex: TouchExplain, w: Words): LadderText {
  const U = w.unit(ex.unit);
  const noun = nounOf(ex.unit);
  const [x, ...others] = ex.cells as [QCell, ...QCell[]];
  const X = w.cell(x);
  const allTouch = ex.unitCells.every((c) => touching(x, c, w.n));
  const first = allTouch
    ? `A queen on ${X} would touch every remaining cell of ${U} (${w.cells(ex.unitCells)}), leaving that ${noun} nowhere to go.`
    : `A queen on ${X} would ${attackPhrase(x, ex.unitCells, w)}: that is every remaining cell of ${U}, leaving that ${noun} nowhere to go.`;
  const why = [first];
  if (others.length) why.push(`A queen on ${w.cells(others, "or")} would do the same.`);
  why.push(`So ${w.cells(ex.cells)} can't hold a queen.`);
  return {
    where: `Look at ${U}.`,
    what: `${nameOf("touch")}: a queen in the wrong spot would leave ${U} with no room at all.`,
    why,
    do: `Cross out ${w.cells(ex.cells)}.`,
  };
}

function confinementText(ex: ConfinementExplain, step: QStep, w: Words): LadderText {
  const k = numberWord(ex.k);
  const lineNoun = ex.lineType === "row" ? "rows" : "columns";
  const regions = w.regions(ex.regions);
  const lines = w.lines(ex.lineType, ex.lines);
  const linesOr = w.lines(ex.lineType, ex.lines, "or");
  const all = ex.k === 2 ? "both" : "all";
  if (ex.form === "regions-in-lines")
    return {
      where: `Look at ${regions}.`,
      what: `${nameOf("confinement")}: ${k} regions fit inside the same ${k} ${lineNoun}.`,
      why: [
        `${cap(regions)} can only put their queens in ${lines}.`,
        `That's ${k} queens that must land in ${k} ${lineNoun}, and ${k} ${lineNoun} hold exactly ${k} queens. So these regions take up ${lines} completely.`,
        `No other region can have its queen in ${linesOr}.`,
      ],
      do: `Cross out ${w.cells(step.eliminations)}.`,
    };
  return {
    where: `Look at ${lines}.`,
    what: `${nameOf("confinement")}: ${k} ${lineNoun} can only take queens from the same ${k} regions.`,
    why: [
      `${cap(lines)} can only get their queens from ${regions}.`,
      `Those ${k} ${lineNoun} need ${k} queens, and ${k} regions have exactly ${k} queens between them. So ${all} of those regions' queens are used up in ${lines}.`,
      `${cap(regions)} can't have a queen anywhere else.`,
    ],
    do: `Cross out ${w.cells(step.eliminations)}.`,
  };
}

function contradictionText(ex: ContradictionExplain, w: Words): LadderText {
  const X = w.cell(ex.cell);
  const E = w.unit(ex.empty);
  const why = [`Suppose ${X} held a queen.`];
  for (const link of ex.chain)
    why.push(`Then ${w.unit(link.unit)} would have only ${w.cell(link.cell)} left, so its queen would have to go there.`);
  why.push(`${ex.chain.length ? "But then" : "Then"} ${E} would have no cell left for its queen.`);
  why.push(`${cap(E)} must have a queen, so the assumption was wrong: ${X} can't hold a queen.`);
  return {
    where: `Look at ${X}.`,
    what: `${nameOf("contradiction")}: imagine a queen on ${X} and follow what it forces.`,
    why,
    do: `Cross out ${X}.`,
  };
}

/** Fallback for techniques without a dedicated template (keeps the ladder total). */
function genericText(step: QStep, w: Words): LadderText {
  const rungs: string[] = [];
  if (step.placements.length) rungs.push(`Place a queen on ${w.cells(step.placements)}.`);
  if (step.eliminations.length) rungs.push(`Cross out ${w.cells(step.eliminations)}.`);
  return {
    where: step.focus.cells.length ? `Look at ${w.cells(step.focus.cells)}.` : "Look at the whole board.",
    what: `${nameOf(step.technique)}.`,
    why: [],
    do: rungs.join(" "),
  };
}

// ---------------------------------------------------------------------------------------------
// Whole-position hints

/** The next hint for the player's position. */
export function queensHint(p: QueensPuzzle, marks: Marks, names?: RegionNamer): QueensHint {
  const { n } = p;
  if (marks.length !== n * n) throw new Error(`Expected ${n * n} marks, got ${marks.length}`);
  const board = makeBoard(p);
  const w = new Words(board, names);
  const isSolution = new Uint8Array(n * n);
  p.solution.forEach((col, row) => (isSolution[cellAt(row, col, n)] = 1));
  const queens: QCell[] = [];
  const badCrosses: QCell[] = [];
  for (let c = 0; c < n * n; c++) {
    if (marks[c] === QUEEN) queens.push(c);
    else if (marks[c] === CROSS && isSolution[c]) badCrosses.push(c);
  }
  const wrong = queens.filter((c) => !isSolution[c]);

  if (!wrong.length && queens.length === n) return solvedHint();
  if (wrong.length) return mistakeHint(p, queens, wrong, w);
  if (badCrosses.length) return notesHint(badCrosses, w);

  const step = nextStep(stateFromMarks(p, marks));
  if (!step) return stuckHint();
  return {
    kind: "step",
    title: nameOf(step.technique),
    technique: step.technique,
    tier: step.tier,
    ladder: stepText(step, p, names),
    step,
  };
}

const rowsOf = (cells: readonly QCell[], n: number): number[] =>
  [...new Set(cells.map((c) => rowOf(c, n)))].sort((a, b) => a - b);

type Conflict = { other: QCell; rule: "row" | "col" | "region" | "touch" };

function conflictOf(c: QCell, queens: readonly QCell[], board: QBoard): Conflict | null {
  const { n, regions } = board;
  const others = queens.filter((q) => q !== c);
  const rules: [Conflict["rule"], (q: QCell) => boolean][] = [
    ["row", (q) => rowOf(q, n) === rowOf(c, n)],
    ["col", (q) => colOf(q, n) === colOf(c, n)],
    ["region", (q) => regions[q] === regions[c]],
    ["touch", (q) => touching(q, c, n)],
  ];
  for (const [rule, test] of rules) {
    const other = others.find(test);
    if (other !== undefined) return { other, rule };
  }
  return null;
}

function mistakeHint(p: QueensPuzzle, queens: QCell[], wrong: QCell[], w: Words): QueensHint {
  const { n, regions } = w.board;
  const conflicts = wrong.map((c) => conflictOf(c, queens, w.board));
  const at = Math.max(
    0,
    conflicts.findIndex((x) => x !== null),
  );
  const focus = wrong[at]!;
  const conflict = conflicts[at] ?? null;
  const F = w.cell(focus);
  const why: string[] = [];
  if (conflict) {
    const O = w.cell(conflict.other);
    if (conflict.rule === "row")
      why.push(`The queens on ${F} and ${O} are both in row ${rowOf(focus, n) + 1}.`, "Each row gets exactly one queen.");
    else if (conflict.rule === "col")
      why.push(`The queens on ${F} and ${O} are both in column ${colOf(focus, n) + 1}.`, "Each column gets exactly one queen.");
    else if (conflict.rule === "region")
      why.push(`The queens on ${F} and ${O} are both in ${w.region(regions[focus]!)}.`, "Each region gets exactly one queen.");
    else why.push(`The queen on ${F} touches the queen on ${O}.`, "Queens can't touch, not even diagonally.");
  } else {
    // Only the correct queens plus this one: the emptiness is then this queen's doing.
    const only = new Uint8Array(n * n);
    for (const q of queens) if (q === focus || !wrong.includes(q)) only[q] = QUEEN;
    const empty = findEmptyUnit(stateFromMarks(p, only));
    if (empty)
      why.push(
        `With a queen on ${F}, ${w.unit(empty)} has no cell left for its queen.`,
        `Every ${nounOf(empty)} needs one, so this queen can't stay.`,
      );
    else why.push(`The queen on ${F} doesn't break a rule yet, but the rest of the puzzle can't be completed around it.`);
  }
  const rest = wrong.filter((c) => c !== focus);
  if (rest.length) {
    const subject = plural(rest.length, "The queen", "The queens");
    why.push(`${subject} on ${w.cells(rest)} ${plural(rest.length, "is", "are")} in the wrong place too.`);
  }
  return {
    kind: "mistake",
    title: "Check your queens",
    ladder: {
      where: `Look at ${w.lines("row", rowsOf(wrong, n))}.`,
      what: wrong.length === 1 ? "A queen is in the wrong place." : `${wrong.length} queens are in the wrong place.`,
      why,
      do: wrong.length === 1 ? "Remove it." : "Remove them.",
    },
    wrongCells: wrong,
  };
}

function notesHint(bad: QCell[], w: Words): QueensHint {
  const k = bad.length;
  return {
    kind: "notes",
    title: "Check your X's",
    ladder: {
      where: `Look at ${w.lines("row", rowsOf(bad, w.n))}.`,
      what:
        k === 1 ? "One of your X's is on a cell that needs a queen." : `${cap(numberWord(k))} of your X's are on cells that need a queen.`,
      why: [
        `An X means "no queen here", but the solution has a queen on ${w.cells(bad)}.`,
        "A wrong X can leave a row, column or region with nowhere to go, and then nothing adds up.",
      ],
      do: `Remove the X${k === 1 ? "" : "'s"} from ${w.cells(bad)}.`,
    },
    wrongCells: bad,
  };
}

function solvedHint(): QueensHint {
  return {
    kind: "solved",
    title: "Solved",
    ladder: {
      where: "The whole board.",
      what: "The puzzle is solved.",
      why: ["Every row, column and region has exactly one queen, and no two queens touch."],
      do: "Nothing left to do. Well played!",
    },
  };
}

function stuckHint(): QueensHint {
  return {
    kind: "stuck",
    title: "No hint available",
    ladder: {
      where: "The whole board.",
      what: "No logical step found from here.",
      why: ["None of the techniques the coach knows makes progress in this position."],
      do: "Check your X's, or imagine a queen on a cell and follow what it forces.",
    },
  };
}
