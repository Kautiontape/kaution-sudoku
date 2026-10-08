/**
 * Hint templates: Step.explain (structured data) → four-rung ladder text.
 * One template per technique id. No prose lives in techniques; all wording lives here.
 */
import { ALL_DIGITS, digitsOf } from "../combos";
import { cellName, houseName } from "../geometry";
import type { LadderText } from "../hint-types";
import type { CellId, Digit, Elimination, House, Puzzle, Step } from "../types";
import {
  aDigit,
  cageName,
  cap,
  cellList,
  comboList,
  comboText,
  digitList,
  list,
  maskList,
  plural,
  regionName,
  relation,
  removeSentence,
} from "./format";

export interface TemplateContext {
  puzzle: Puzzle;
}

export type Template = (step: Step, ctx: TemplateContext) => LadderText;

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const word = (n: number): string => NUMBER_WORDS[n] ?? String(n);
const Word = (n: number): string => cap(word(n));

function placeText(step: Step): string {
  const p = step.placements[0]!;
  return `Place ${p.digit} in ${cellName(p.cell)}.`;
}

function elimCells(elims: readonly Elimination[]): CellId[] {
  return [...new Set(elims.map((e) => e.cell))].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------------------------
// Singles

interface FullHouseX {
  cell: CellId;
  digit: Digit;
  house: House;
}
const fullHouse: Template = (step) => {
  const e = step.explain as unknown as FullHouseX;
  const h = houseName(e.house);
  return {
    where: `Look at ${h}.`,
    what: `Only one cell in ${h} is still empty.`,
    why: [`${cap(h)} already has eight of its nine digits. The only one missing is ${e.digit}, and ${cellName(e.cell)} is the only empty cell left for it.`],
    do: placeText(step),
  };
};

interface Blocked {
  cell: CellId;
  by: CellId | null;
}
interface HiddenSingleX {
  cell: CellId;
  digit: Digit;
  house: House;
  blocked: Blocked[];
}

/** "r2c1 and r3c1 see the 5 in r7c1 (same column)." grouped by blocker. */
function blockedSentences(blocked: readonly Blocked[], d: Digit, p: Puzzle): string[] {
  const groups = new Map<CellId | null, CellId[]>();
  for (const b of blocked) groups.set(b.by, [...(groups.get(b.by) ?? []), b.cell]);
  const out: string[] = [];
  for (const [by, cells] of groups) {
    if (by === null) continue;
    const rel = new Set(cells.map((c) => relation(c, by, p)));
    const why = rel.size === 1 ? ` (${[...rel][0]})` : "";
    out.push(`${cellList(cells)} ${plural(cells.length, "sees", "see")} the ${d} in ${cellName(by)}${why}.`);
  }
  const ruled = groups.get(null);
  if (ruled?.length)
    out.push(`${cellList(ruled)} ${plural(ruled.length, "has", "have")} already had ${d} ruled out by earlier deductions.`);
  return out;
}

const hiddenSingle: Template = (step, { puzzle }) => {
  const e = step.explain as unknown as HiddenSingleX;
  const h = houseName(e.house);
  const why = [`Every ${e.house.kind === "box" ? "box" : e.house.kind === "row" ? "row" : "column"} needs ${aDigit(e.digit)}. In ${h}, ${cellName(e.cell)} is the only cell that can still take it.`];
  if (e.blocked.length) why.push(`The other empty cells are blocked: ${blockedSentences(e.blocked, e.digit, puzzle).join(" ")}`);
  return {
    where: `Look at ${h}.`,
    what: `In ${h}, one digit has only one place it can go.`,
    why,
    do: placeText(step),
  };
};

interface NakedSingleX {
  cell: CellId;
  digit: Digit;
  seen: { digit: Digit; by: CellId | null }[];
}
const nakedSingle: Template = (step, { puzzle }) => {
  const e = step.explain as unknown as NakedSingleX;
  const name = cellName(e.cell);
  const byRel = new Map<string, Digit[]>();
  for (const s of e.seen) {
    const key = s.by === null ? "earlier" : relation(e.cell, s.by, puzzle);
    byRel.set(key, [...(byRel.get(key) ?? []), s.digit]);
  }
  const label: Record<string, string> = {
    "same row": "its row has",
    "same column": "its column has",
    "same box": "its box has",
    "same cage": "its cage has",
  };
  const parts: string[] = [];
  for (const key of ["same row", "same column", "same box", "same cage"]) {
    const ds = byRel.get(key);
    if (ds?.length) parts.push(`${label[key]} ${digitList(ds)}`);
  }
  const earlier = byRel.get("earlier");
  const why = [`Look at what ${name} can see: ${parts.length ? list(parts) : "its notes"}.`];
  if (earlier?.length) why.push(`${digitList(earlier)} ${plural(earlier.length, "was", "were")} already ruled out of ${name} by earlier deductions.`);
  why.push(`Every digit except ${e.digit} is taken, so ${name} must be ${e.digit}.`);
  return {
    where: `Look at ${name}.`,
    what: `${name} has only one candidate left.`,
    why,
    do: placeText(step),
  };
};

// ---------------------------------------------------------------------------------------------
// Intersections

interface PointingX {
  digit: Digit;
  box: House;
  line: House;
  cells: CellId[];
}
const pointing: Template = (step) => {
  const e = step.explain as unknown as PointingX;
  const box = houseName(e.box);
  const line = houseName(e.line);
  return {
    where: `Look at ${box}.`,
    what: `Inside ${box}, one digit is stuck on a single line.`,
    why: [
      `In ${box}, ${e.digit} can only go in ${cellList(e.cells)} — all of them in ${line}.`,
      `Whichever of those cells ends up with the ${e.digit}, ${line}'s ${e.digit} will be inside ${box}.`,
      `So no other cell in ${line} can be ${e.digit}.`,
    ],
    do: removeSentence(step.eliminations),
  };
};

const claiming: Template = (step) => {
  const e = step.explain as unknown as PointingX;
  const box = houseName(e.box);
  const line = houseName(e.line);
  return {
    where: `Look at ${line}.`,
    what: `In ${line}, one digit is stuck inside a single box.`,
    why: [
      `In ${line}, ${e.digit} can only go in ${cellList(e.cells)} — all of them inside ${box}.`,
      `${cap(line)} needs ${aDigit(e.digit)}, so ${box}'s ${e.digit} has to be one of those cells.`,
      `That means the rest of ${box} can't be ${e.digit}.`,
    ],
    do: removeSentence(step.eliminations),
  };
};

// ---------------------------------------------------------------------------------------------
// Subsets

const SUBSET_NAME = { 2: "pair", 3: "triple", 4: "quad" } as Record<number, string>;

interface NakedSubsetX {
  size: number;
  cells: CellId[];
  digits: Digit[];
  house: House;
  houses: House[];
}
const nakedSubset: Template = (step) => {
  const e = step.explain as unknown as NakedSubsetX;
  const h = houseName(e.house);
  const where = list(e.houses.map(houseName));
  return {
    where: `Look at ${h}.`,
    what: `${Word(e.size)} cells in ${h} share the same ${word(e.size)} candidates.`,
    why: [
      `${cellList(e.cells)} can only hold ${digitList(e.digits)} — ${word(e.size)} cells, ${word(e.size)} digits.`,
      `However they're arranged, those ${word(e.size)} digits will fill those ${word(e.size)} cells. That's a naked ${SUBSET_NAME[e.size]}.`,
      `So nothing else in ${where} can be ${digitList(e.digits, "or")}.`,
    ],
    do: removeSentence(step.eliminations),
  };
};

interface HiddenSubsetX {
  size: number;
  cells: CellId[];
  digits: Digit[];
  house: House;
}
const hiddenSubset: Template = (step) => {
  const e = step.explain as unknown as HiddenSubsetX;
  const h = houseName(e.house);
  return {
    where: `Look at ${h}.`,
    what: `In ${h}, ${word(e.size)} digits can only go in the same ${word(e.size)} cells.`,
    why: [
      `In ${h}, ${digitList(e.digits)} can only go in ${cellList(e.cells)}.`,
      `${Word(e.size)} digits need ${word(e.size)} homes, and these are the only ones — so those cells belong to ${digitList(e.digits)}. That's a hidden ${SUBSET_NAME[e.size]}.`,
      `Any other candidates in ${cellList(e.cells)} can go.`,
    ],
    do: `Keep only ${digitList(e.digits)} in ${cellList(e.cells)}.`,
  };
};

// ---------------------------------------------------------------------------------------------
// Killer

interface CageLastCellX {
  cage: number;
  sum: number;
  size: number;
  cell: CellId;
  digit: Digit;
  placed: { cell: CellId; digit: Digit }[];
}
const cageLastCell: Template = (step, { puzzle }) => {
  const e = step.explain as unknown as CageLastCellX;
  const name = cageName(puzzle, e.cage);
  if (e.size === 1)
    return {
      where: `Look at ${name}.`,
      what: `A one-cell cage gives its digit away.`,
      why: [`A cage that covers a single cell simply is its sum: ${cellName(e.cell)} = ${e.digit}.`],
      do: placeText(step),
    };
  const placedSum = e.placed.reduce((a, p) => a + p.digit, 0);
  return {
    where: `Look at ${name}.`,
    what: `Only one cell of this cage is still empty.`,
    why: [
      `The cage adds up to ${e.sum}. ${list(e.placed.map((p) => `${cellName(p.cell)} = ${p.digit}`))} already ${plural(e.placed.length, "makes", "make")} ${placedSum}.`,
      `So ${cellName(e.cell)} = ${e.sum} − ${placedSum} = ${e.digit}.`,
    ],
    do: placeText(step),
  };
};

interface CageCombosX {
  basis: "sum" | "candidates";
  cage: number;
  sum: number;
  size: number;
  cells: CellId[];
  rem: number;
  placed: { cell: CellId; digit: Digit }[];
  combos: number[];
  valid: number[];
  invalid: { combo: number; missing: Digit[] }[];
  allowed: number;
}

function needSentence(e: { cells: CellId[]; rem: number; placed: { cell: CellId; digit: Digit }[]; size: number; sum: number }): string {
  const n = e.cells.length;
  if (!e.placed.length) return `${Word(n)} different digits that add up to ${e.sum}`;
  const placed = list(e.placed.map((p) => `${cellName(p.cell)} = ${p.digit}`));
  return `With ${placed} already in, the other ${word(n)} ${plural(n, "cell needs", "cells need")} ${e.rem} using ${plural(n, "a digit", "different digits")} the cage hasn't used`;
}

const cageCombos: Template = (step, { puzzle }) => {
  const e = step.explain as unknown as CageCombosX;
  const name = cageName(puzzle, e.cage);
  const cells = cellList(e.cells);
  const allowed = digitsOf(e.allowed);
  const why: string[] = [];
  if (e.basis === "sum") {
    why.push(`${needSentence(e)}: ${comboList(e.combos, "or")}.`);
    if (e.combos.length === 1) why.push(`That's the only way to make it, so ${cells} hold exactly ${digitList(allowed)}, in some order.`);
    else {
      const never = digitsOf(ALL_DIGITS & ~e.allowed);
      why.push(`None of those combinations uses ${digitList(never, "or")}, so those digits can't go anywhere in this cage.`);
    }
    return {
      where: `Look at ${name}.`,
      what: e.combos.length === 1 ? `This cage's sum can only be made one way.` : `Some digits can't fit this cage's sum.`,
      why,
      do: `Pencil ${digitList(allowed)} into ${cells} (and nothing else).`,
    };
  }
  why.push(`${needSentence(e)}: ${comboList(e.combos, "or")}.`);
  for (const bad of e.invalid) {
    if (bad.missing.length)
      why.push(`${comboText(bad.combo)} is out — no cell in the cage can hold ${digitList(bad.missing, "or")} any more.`);
    else why.push(`${comboText(bad.combo)} is out — its digits can't be arranged in these cells' candidates.`);
  }
  why.push(
    e.valid.length === 1
      ? `Only ${comboText(e.valid[0]!)} is left, and the cells' candidates follow from it.`
      : `That leaves ${comboList(e.valid, "or")}, which narrows what each cell can be.`,
  );
  return {
    where: `Look at ${name}.`,
    what: `Some of this cage's combinations don't fit what's already on the board.`,
    why,
    do: removeSentence(step.eliminations),
  };
};

interface CageLockedX {
  cage: number;
  sum: number;
  size: number;
  digit: Digit;
  house: House;
  cells: CellId[];
  valid: number[];
  inside: boolean;
}
const cageLocked: Template = (step, { puzzle }) => {
  const e = step.explain as unknown as CageLockedX;
  const name = cageName(puzzle, e.cage);
  const h = houseName(e.house);
  const why = [
    e.valid.length === 1
      ? `${cap(name)} can only be ${comboText(e.valid[0]!)}, so it must contain ${aDigit(e.digit)}.`
      : `Every way to make ${name} uses ${aDigit(e.digit)}: ${comboList(e.valid, "or")}.`,
  ];
  why.push(
    e.cells.length === 1
      ? `The only cell of the cage that can take the ${e.digit} is ${cellName(e.cells[0]!)}, in ${h}.`
      : `Inside the cage, the ${e.digit} can only go in ${cellList(e.cells)} — all in ${h}.`,
  );
  why.push(`So ${h}'s ${e.digit} is inside this cage, and no other cell of ${h} can be ${e.digit}.`);
  return {
    where: `Look at ${name}.`,
    what: `This cage must contain a certain digit, and it's confined to one ${e.house.kind === "box" ? "box" : e.house.kind === "row" ? "row" : "column"}.`,
    why,
    do: removeSentence(step.eliminations),
  };
};

interface CageClaimX {
  cage: number;
  digit: Digit;
  house: House;
  cells: CellId[];
  valid: number[];
  dropped: number[];
}
const cageClaim: Template = (step, { puzzle }) => {
  const e = step.explain as unknown as CageClaimX;
  const name = cageName(puzzle, e.cage);
  const h = houseName(e.house);
  const why = [
    `In ${h}, ${e.digit} can only go in ${cellList(e.cells)} — all inside ${name}.`,
    `${cap(h)} needs ${aDigit(e.digit)}, so that cage must contain it.`,
  ];
  if (e.dropped.length) why.push(`That rules out the cage's combinations without ${aDigit(e.digit)} (${comboList(e.dropped)}), leaving ${comboList(e.valid, "or")}.`);
  why.push(`And since a cage never repeats a digit, its cells outside ${h} can't be ${e.digit} either.`);
  return {
    where: `Look at ${h}.`,
    what: `${cap(h)} can only put one of its digits inside a single cage.`,
    why,
    do: removeSentence(step.eliminations),
  };
};

interface InniesX {
  side: "innies" | "outies";
  houses: House[];
  total: number;
  inside: { id: number; sum: number }[];
  insideSum: number;
  partial: { id: number; sum: number; inCells: CellId[]; outCells: CellId[] }[];
  cells: CellId[];
  sum: number;
  placed: { cell: CellId; digit: Digit }[];
  empty: CellId[];
  target: number;
  result: "place" | "eliminate";
  support?: number[];
}
const innies: Template = (step) => {
  const e = step.explain as unknown as InniesX;
  const region = regionName(e.houses);
  const n = e.houses.length;
  const why: string[] = [];
  why.push(
    n === 1
      ? `Every row, column and box adds up to 45 (1+2+…+9).`
      : `${cap(region)} cover ${word(n)} whole houses, so together they add up to ${n} × 45 = ${e.total}.`,
  );
  const insideSums = e.inside.map((c) => String(c.sum));
  const insideText = e.inside.length
    ? `The cages entirely inside ${region} (${list(insideSums)}) add up to ${e.insideSum}.`
    : `No cage sits entirely inside ${region}.`;
  why.push(insideText);
  if (e.side === "innies") {
    why.push(
      `That leaves ${e.total} − ${e.insideSum} = ${e.sum} for the cells of ${region} whose cages stick out: ${cellList(e.cells)} — the "innies".`,
    );
  } else {
    const partialSum = e.partial.reduce((a, p) => a + p.sum, 0);
    why.push(
      `The cages that poke out of ${region} (${list(e.partial.map((p) => String(p.sum)))}) add up to ${partialSum}. Together with the inside cages they cover all of ${region} plus the cells outside it: ${cellList(e.cells)} — the "outies".`,
      `So the outies add up to ${e.insideSum} + ${partialSum} − ${e.total} = ${e.sum}.`,
    );
  }
  const placedSum = e.placed.reduce((a, p) => a + p.digit, 0);
  if (e.placed.length)
    why.push(
      `${list(e.placed.map((p) => `${cellName(p.cell)} = ${p.digit}`))} ${plural(e.placed.length, "is", "are")} already placed, so ${cellList(e.empty)} ${plural(e.empty.length, "is", "add up to")} ${e.sum} − ${placedSum} = ${e.target}.`,
    );
  if (e.result === "place") {
    if (!e.placed.length) why.push(`With just one cell, that's its digit: ${cellName(e.empty[0]!)} = ${e.target}.`);
  } else {
    const allowed = (e.support ?? []).reduce((a, m) => a | m, 0);
    why.push(
      `Treat ${cellList(e.empty)} like a cage of ${e.target}: only ${digitList(digitsOf(allowed))} can make that work with their candidates.`,
    );
  }
  return {
    where: `Look at ${region}.`,
    what: `The 45 rule: ${region} must add up to ${e.total}.`,
    why,
    do: e.result === "place" ? placeText(step) : removeSentence(step.eliminations),
  };
};

export const BASIC_TEMPLATES: Record<string, Template> = {
  "full-house": fullHouse,
  "hidden-single": hiddenSingle,
  "naked-single": nakedSingle,
  pointing,
  claiming,
  "naked-pair": nakedSubset,
  "naked-triple": nakedSubset,
  "naked-quad": nakedSubset,
  "hidden-pair": hiddenSubset,
  "hidden-triple": hiddenSubset,
  "hidden-quad": hiddenSubset,
  "cage-last-cell": cageLastCell,
  "cage-combos": cageCombos,
  "cage-locked": cageLocked,
  "cage-claim": cageClaim,
  "innies-outies": innies,
};

/** Fallback for a technique without a template (shouldn't happen; keeps hints working). */
export const genericTemplate: Template = (step) => ({
  where: step.focus.houses.length ? `Look at ${list(step.focus.houses.map(houseName))}.` : `Look at ${cellList(step.focus.cells)}.`,
  what: `There's a ${step.technique.replace(/-/g, " ")} here.`,
  why: [`The highlighted cells form a ${step.technique.replace(/-/g, " ")} pattern.`],
  do: step.placements.length ? placeText(step) : removeSentence(step.eliminations),
});

export { elimCells, maskList };
