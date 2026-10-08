/**
 * Hint templates for the advanced techniques in techniques/advanced.ts: Step.explain → four-rung
 * ladder text. Same voice as templates.ts: "where" points at the area without naming the
 * technique, "what" is a one-line nudge, "why" walks through the argument with concrete cells,
 * digits and houses, "do" says what changes.
 */
import { cellName, houseName } from "../geometry";
import type { CellId, Digit, Elimination, House, Puzzle, Step } from "../types";
import { chainSentences, isText, type ChainLinkX, type ChainNode } from "./chain-text";
import { cap, cellList, digitList, list, plural, regionName, relation, removeSentence } from "./format";
import { elimCells, type Template } from "./templates";

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const word = (n: number): string => NUMBER_WORDS[n] ?? String(n);

/** "r6c8 sees" / "r8c8 and r9c8 see" */
const sees = (cells: readonly CellId[]): string => `${cellList(cells)} ${plural(cells.length, "sees", "see")}`;
/** "it" / "they" */
const pron = (cells: readonly CellId[]): string => plural(cells.length, "it", "they");
const targetsOf = (step: Step): CellId[] => elimCells(step.eliminations);
/** Digits in ascending order: "1, 6 or 9". */
const sorted = (ds: readonly Digit[], conj = "and"): string => digitList([...ds].sort((x, y) => x - y), conj);
/** "r1c2 or r1c7" */
const orList = (cells: readonly CellId[]): string => cellList(cells, "or");

function inHouse(c: CellId, h: House): boolean {
  const r = Math.floor(c / 9);
  const k = c % 9;
  if (h.kind === "row") return r === h.index;
  if (h.kind === "col") return k === h.index;
  return Math.floor(r / 3) * 3 + Math.floor(k / 3) === h.index;
}

/** Shared ending: "r6c8 sees both r2c8 and r6c2, so it can't be 5." */
function seesBoth(targets: readonly CellId[], a: CellId, b: CellId, d: Digit): string {
  return `${sees(targets)} both ${cellName(a)} and ${cellName(b)}, so ${pron(targets)} can't be ${d}.`;
}

// ---------------------------------------------------------------------------------------------
// Fish

const FISH_NAMES: Record<number, string> = { 2: "X-wing", 3: "swordfish", 4: "jellyfish" };

interface FishX {
  size: number;
  digit: Digit;
  baseKind: "row" | "col";
  base: House[];
  cover: House[];
  cells: CellId[];
}

/** "In row 2, 5 can only go in r2c3 or r2c8." per base line. */
function baseLines(e: FishX, extra: readonly CellId[] = []): string[] {
  return e.base.map((h) => {
    const cells = [...e.cells, ...extra].filter((c) => inHouse(c, h)).sort((a, b) => a - b);
    return `In ${houseName(h)}, ${e.digit} can only go in ${orList(cells)}.`;
  });
}

const fish: Template = (step) => {
  const e = step.explain as unknown as FishX;
  const bases = regionName(e.base);
  const covers = regionName(e.cover);
  const coverWord = e.baseKind === "row" ? "column" : "row";
  const baseWord = e.baseKind === "row" ? "row" : "column";
  const why = baseLines(e);
  if (e.size === 2) {
    const [b0, b1] = e.base as [House, House];
    const [c0, c1] = e.cover as [House, House];
    const corner = (b: House, c: House) => cellName(e.cells.find((x) => inHouse(x, b) && inHouse(x, c))!);
    why.push(
      `If ${corner(b0, c0)} is ${e.digit}, then ${houseName(b1)}'s ${e.digit} has to be ${corner(b1, c1)}; if ${corner(b0, c1)} is ${e.digit}, it has to be ${corner(b1, c0)}.`,
      `Either way, ${houseName(c0)} and ${houseName(c1)} each get their ${e.digit} from ${bases}.`,
    );
  } else {
    why.push(
      `Each of these ${word(e.size)} ${baseWord}s needs a ${e.digit}, and no two of them can put it in the same ${coverWord}.`,
      `So ${bases} use up the ${e.digit}s of all ${word(e.size)} ${coverWord}s: ${covers}.`,
    );
  }
  why.push(`That means no other cell in ${covers} can be ${e.digit}. (This pattern is called a${e.size === 2 ? "n" : ""} ${FISH_NAMES[e.size]}.)`);
  return {
    where: `Look at the ${e.digit}s in ${bases}.`,
    what: `In ${bases}, every ${e.digit} sits in the same ${word(e.size)} ${coverWord}s.`,
    why,
    do: removeSentence(step.eliminations),
  };
};

interface FinnedX extends FishX {
  fins: CellId[];
  finBox: House;
  sashimi: boolean;
}

const finnedFish: Template = (step) => {
  const e = step.explain as unknown as FinnedX;
  const bases = regionName(e.base);
  const covers = regionName(e.cover);
  const coverWord = e.baseKind === "row" ? "column" : "row";
  const name = FISH_NAMES[e.size]!;
  const fins = cellList(e.fins);
  const one = e.fins.length === 1;
  const targets = targetsOf(step);
  const why = baseLines(e, e.fins);
  why.push(
    `Leave out ${fins} for a moment (the "${plural(e.fins.length, "fin", "fins")}"): then every ${e.digit} in ${bases} would sit in ${covers} — a${e.size === 2 ? "n" : ""} ${name} — and no other cell of ${covers} could be ${e.digit}.`,
  );
  if (e.sashimi)
    why.push(`(One of those ${e.baseKind === "row" ? "rows" : "columns"} has only one cell left in ${covers}. That's fine — the argument still works.)`);
  why.push(
    `So either ${one ? `the fin ${fins} is` : `one of the fins ${cellList(e.fins, "or")} is`} ${e.digit}, or the ${name} holds.`,
    `${cellList(targets)} ${plural(targets.length, "lies", "lie")} in ${regionName(e.cover.filter((h) => targets.some((t) => inHouse(t, h))))} and ${plural(targets.length, "sees", "see")} ${one ? "the fin" : "every fin"}. If ${one ? "the fin" : "a fin"} is ${e.digit}, ${pron(targets)} can't be ${e.digit}; if not, the ${name} rules ${plural(targets.length, "it", "them")} out. Either way, ${pron(targets)} can't be ${e.digit}.`,
  );
  return {
    where: `Look at the ${e.digit}s in ${bases}.`,
    what: `The ${e.digit}s in ${bases} almost fit in ${word(e.size)} ${coverWord}s — all but ${word(e.fins.length)} in ${houseName(e.finBox)}.`,
    why,
    do: removeSentence(step.eliminations),
  };
};

// ---------------------------------------------------------------------------------------------
// Single-digit patterns

interface SkyscraperX {
  digit: Digit;
  lines: [House, House];
  baseLine: House;
  base: [CellId, CellId];
  tops: [CellId, CellId];
}
const skyscraper: Template = (step) => {
  const e = step.explain as unknown as SkyscraperX;
  const d = e.digit;
  const lines = regionName(e.lines);
  const [b0, b1] = e.base.map(cellName) as [string, string];
  const [t0, t1] = e.tops.map(cellName) as [string, string];
  return {
    where: `Look at the ${d}s in ${lines}.`,
    what: `${cap(lines)} each have only two places for ${d}, and one end of each lines up.`,
    why: [
      `In ${houseName(e.lines[0])}, ${d} can only go in ${b0} or ${t0}. In ${houseName(e.lines[1])}, it can only go in ${b1} or ${t1}.`,
      `${b0} and ${b1} are both in ${houseName(e.baseLine)}, so at most one of them is ${d}.`,
      `If ${b0} isn't ${d}, then ${t0} is; if ${b1} isn't ${d}, then ${t1} is. One of those has to happen, so ${t0} or ${t1} is ${d}.`,
      seesBoth(targetsOf(step), e.tops[0], e.tops[1], d),
    ],
    do: removeSentence(step.eliminations),
  };
};

interface KiteX {
  digit: Digit;
  row: House;
  col: House;
  box: House;
  rowCells: [CellId, CellId];
  colCells: [CellId, CellId];
}
const twoStringKite: Template = (step) => {
  const e = step.explain as unknown as KiteX;
  const d = e.digit;
  const [rIn, rFar] = e.rowCells.map(cellName) as [string, string];
  const [cIn, cFar] = e.colCells.map(cellName) as [string, string];
  const row = houseName(e.row);
  const col = houseName(e.col);
  return {
    where: `Look at the ${d}s in ${row} and ${col}.`,
    what: `${cap(row)} and ${col} each have only two places for ${d}, and they meet in ${houseName(e.box)}.`,
    why: [
      `In ${row}, ${d} can only go in ${rIn} or ${rFar}. In ${col}, it can only go in ${cIn} or ${cFar}.`,
      `${rIn} and ${cIn} are both in ${houseName(e.box)}, so at most one of them is ${d}.`,
      `If ${rIn} isn't ${d}, then ${rFar} is; if ${cIn} isn't ${d}, then ${cFar} is. So ${rFar} or ${cFar} is ${d}.`,
      seesBoth(targetsOf(step), e.rowCells[1], e.colCells[1], d),
    ],
    do: removeSentence(step.eliminations),
  };
};

interface EmptyRectangleX {
  digit: Digit;
  box: House;
  boxRow: House;
  boxCol: House;
  boxCells: CellId[];
  pair: [CellId, CellId];
  pairLine: House;
  target: CellId;
}
const emptyRectangle: Template = (step, { puzzle }) => {
  const e = step.explain as unknown as EmptyRectangleX;
  const d = e.digit;
  const box = houseName(e.box);
  const [near, far] = e.pair.map(cellName) as [string, string];
  const target = cellName(e.target);
  // The pair's near end sits on one of the box's lines; the target sits on the other.
  const nearLine = e.pairLine.kind === "col" ? e.boxRow : e.boxCol;
  const otherLine = e.pairLine.kind === "col" ? e.boxCol : e.boxRow;
  return {
    where: `Look at the ${d}s in ${box} and ${houseName(e.pairLine)}.`,
    what: `In ${box}, every ${d} sits on ${houseName(e.boxRow)} or ${houseName(e.boxCol)}.`,
    why: [
      `In ${box}, the only places for ${d} are ${cellList(e.boxCells)}, all on ${houseName(e.boxRow)} or ${houseName(e.boxCol)}.`,
      `In ${houseName(e.pairLine)}, ${d} can only go in ${near} or ${far}.`,
      `If ${near} is ${d}, then ${houseName(nearLine)}'s ${d} is outside ${box}, so the box's ${d} must be on ${houseName(otherLine)} — and ${target}, further along ${houseName(otherLine)}, can't be ${d}.`,
      `If ${near} isn't ${d}, then ${far} is, and ${target} sees it (${relation(e.target, e.pair[1], puzzle)}).`,
      `Either way, ${target} can't be ${d}.`,
    ],
    do: removeSentence(step.eliminations),
  };
};

// ---------------------------------------------------------------------------------------------
// Wings

interface WingX {
  pivot: CellId;
  pincers: [CellId, CellId];
  x: Digit;
  y: Digit;
  z: Digit;
}

const xyWing: Template = (step, { puzzle }) => {
  const e = step.explain as unknown as WingX;
  const [a, b] = e.pincers;
  const pivot = cellName(e.pivot);
  const targets = targetsOf(step);
  return {
    where: `Look at ${pivot} and the two-candidate cells it sees.`,
    what: `Whichever of its two digits ${pivot} turns out to be, one of two partner cells gets the same third digit.`,
    why: [
      `${pivot} is either ${e.x} or ${e.y}.`,
      `If it's ${e.x}, ${cellName(a)} can't also be ${e.x} (${relation(e.pivot, a, puzzle)}), so ${cellName(a)} must be ${e.z}.`,
      `If it's ${e.y}, ${cellName(b)} can't also be ${e.y} (${relation(e.pivot, b, puzzle)}), so ${cellName(b)} must be ${e.z}.`,
      `Either way, one of ${cellName(a)} and ${cellName(b)} is ${e.z}. ${sees(targets)} both of them, so ${pron(targets)} can't be ${e.z}.`,
    ],
    do: removeSentence(step.eliminations),
  };
};

const xyzWing: Template = (step, { puzzle }) => {
  const e = step.explain as unknown as WingX;
  const [a, b] = e.pincers;
  const pivot = cellName(e.pivot);
  const targets = targetsOf(step);
  return {
    where: `Look at ${pivot} and the two-candidate cells it sees.`,
    what: `A three-candidate cell and two helpers share a digit that has to land among them.`,
    why: [
      `${pivot} can be ${sorted([e.x, e.y, e.z], "or")}. ${cellName(a)} can only be ${sorted([e.x, e.z], "or")}, and ${cellName(b)} only ${sorted([e.y, e.z], "or")}.`,
      `If ${pivot} is ${e.x}, ${cellName(a)} must be ${e.z} (${relation(e.pivot, a, puzzle)}). If it's ${e.y}, ${cellName(b)} must be ${e.z} (${relation(e.pivot, b, puzzle)}). And if ${pivot} is ${e.z}, the ${e.z} is right there.`,
      `So one of ${pivot}, ${cellName(a)} and ${cellName(b)} is ${e.z}. ${sees(targets)} all three, so ${pron(targets)} can't be ${e.z}.`,
    ],
    do: removeSentence(step.eliminations),
  };
};

interface WWingX {
  cells: [CellId, CellId];
  x: Digit;
  y: Digit;
  link: [CellId, CellId];
  linkHouse: House;
}
const wWing: Template = (step, { puzzle }) => {
  const e = step.explain as unknown as WWingX;
  const [a, b] = e.cells;
  const [c, d] = e.link;
  const targets = targetsOf(step);
  return {
    where: `Look at ${cellName(a)} and ${cellName(b)}.`,
    what: `Two cells with the same two candidates are connected through ${houseName(e.linkHouse)}.`,
    why: [
      `${cellName(a)} and ${cellName(b)} can each only be ${sorted([e.x, e.y], "or")}.`,
      `In ${houseName(e.linkHouse)}, ${e.x} can only go in ${cellName(c)} or ${cellName(d)}.`,
      `Suppose ${cellName(a)} isn't ${e.y}. Then it's ${e.x}, so ${cellName(c)} isn't ${e.x} (${relation(a, c, puzzle)}), so ${cellName(d)} is ${e.x}, so ${cellName(b)} isn't ${e.x} (${relation(d, b, puzzle)}) — it's ${e.y}.`,
      `So at least one of ${cellName(a)} and ${cellName(b)} is ${e.y}. ${sees(targets)} both, so ${pron(targets)} can't be ${e.y}.`,
    ],
    do: removeSentence(step.eliminations),
  };
};

// ---------------------------------------------------------------------------------------------
// Colouring

interface ColoringX {
  rule: "wrap" | "trap";
  digit: Digit;
  on: CellId[];
  off: CellId[];
  links: { a: CellId; b: CellId; house: House }[];
  clash?: { cells: [CellId, CellId]; house: House | null };
  traps?: { cell: CellId; on: CellId; off: CellId }[];
}
const simpleColoring: Template = (step, { puzzle }) => {
  const e = step.explain as unknown as ColoringX;
  const d = e.digit;
  const why = [
    `When a row, column or box has only two places for ${d}, exactly one of them is ${d}.`,
    `Chain those pairs together: ${list(e.links.map((l) => `${cellName(l.a)}–${cellName(l.b)} (${houseName(l.house)})`))}.`,
    `Colour the cells alternately along the chain. One colour: ${cellList(e.on)}. The other: ${cellList(e.off)}. One colour is all ${d}s and the other has none.`,
  ];
  if (e.rule === "wrap") {
    const [a, b] = e.clash!.cells;
    const where = e.clash!.house ? `share ${houseName(e.clash!.house)}` : `are in the same cage`;
    why.push(
      `${cellName(a)} and ${cellName(b)} have the same colour and ${where}, so they can't both be ${d}. Their colour must be the one with no ${d}s.`,
      `So none of ${cellList(e.off)} can be ${d} — and ${cellList(e.on)} will all be ${d}s.`,
    );
  } else {
    const traps = e.traps ?? [];
    const shown = traps.length <= 3 ? traps : traps.slice(0, 2);
    for (const t of shown)
      why.push(
        `${cellName(t.cell)} sees ${cellName(t.on)} (${relation(t.cell, t.on, puzzle)}) and ${cellName(t.off)} (${relation(t.cell, t.off, puzzle)}), which have different colours — one of them is ${d}, so ${cellName(t.cell)} can't be.`,
      );
    if (shown.length < traps.length)
      why.push(`The same goes for ${cellList(traps.slice(shown.length).map((t) => t.cell))}: each sees both colours.`);
  }
  return {
    where: `Look at the ${d}s across the board.`,
    what: `Follow the ${d}s that come in pairs and colour them alternately.`,
    why,
    do: removeSentence(step.eliminations),
  };
};

// ---------------------------------------------------------------------------------------------
// Uniqueness

interface UrX {
  type: 1 | 2 | 4;
  digits: [Digit, Digit];
  corners: CellId[];
  floor: CellId[];
  roof: CellId[];
  roofExtras: Digit[][];
  extra?: Digit;
  house?: House;
  locked?: Digit;
  removed?: Digit;
}
const uniqueRectangle: Template = (step) => {
  const e = step.explain as unknown as UrX;
  const [a, b] = e.digits;
  const floor = cellList(e.floor);
  const roof = e.roof.map(cellName);
  const swap = `all four corners would be ${a}s and ${b}s that could swap places — every row, column and box would still work, so the puzzle would have two solutions`;
  const why: string[] = [];
  if (e.type === 1) {
    why.push(
      `${floor} can only be ${a} or ${b}. ${roof[0]} can be ${a} or ${b} too, but also ${digitList(e.roofExtras[0]!, "or")}.`,
      `These four cells are the corners of a rectangle on two rows, two columns and two boxes. If ${roof[0]} were ${a} or ${b} too, ${swap}.`,
      `A proper puzzle has only one solution, so ${roof[0]} can't be ${a} or ${b}.`,
    );
  } else if (e.type === 2) {
    const targets = targetsOf(step);
    why.push(
      `${floor} can only be ${a} or ${b}; ${list(roof)} can be ${a}, ${b} or ${e.extra}.`,
      `These four cells are the corners of a rectangle on two rows, two columns and two boxes. If neither ${list(roof, "nor")} were ${e.extra}, ${swap}.`,
      `A proper puzzle has only one solution, so one of ${list(roof)} is ${e.extra}. ${sees(targets)} both, so ${pron(targets)} can't be ${e.extra}.`,
    );
  } else {
    why.push(
      `${floor} can only be ${a} or ${b}, and ${list(roof)} can be ${a} or ${b} among other things.`,
      `These four cells are the corners of a rectangle on two rows, two columns and two boxes.`,
      `In ${houseName(e.house!)}, ${e.locked} can only go in ${list(roof, "or")}, so one of them is ${e.locked}.`,
      `If the other one were ${e.removed}, ${swap}. So neither ${list(roof, "nor")} can be ${e.removed}.`,
    );
  }
  return {
    where: `Look at ${cellList(e.corners)}.`,
    what: `Four cells in two boxes nearly hold the same two digits — a pattern a puzzle with one solution can't finish in.`,
    why,
    do: removeSentence(step.eliminations),
  };
};

interface BugX {
  cell: CellId;
  digit: Digit;
  others: Digit[];
  houses: House[];
}
const bugPlusOne: Template = (step) => {
  const e = step.explain as unknown as BugX;
  const name = cellName(e.cell);
  const all = [...e.others, e.digit].sort((x, y) => x - y);
  return {
    where: `Look at ${name}.`,
    what: `Every empty cell but one has exactly two candidates.`,
    why: [
      `Every empty cell has exactly two candidates except ${name}, which has three: ${digitList(all)}.`,
      `If ${name} were ${digitList(e.others, "or")}, every digit would have exactly two places in every row, column and box. A board like that can always be finished in two ways (or none) — but a proper puzzle has exactly one solution.`,
      `${e.digit} is the odd one out: it has three places in each of ${list(e.houses.map(houseName))}. So ${name} must be ${e.digit}.`,
    ],
    do: `Place ${e.digit} in ${name}.`,
  };
};

// ---------------------------------------------------------------------------------------------
// Chains

interface ChainX {
  variant: "x-chain" | "xy-chain" | "aic";
  nodes: ChainNode[];
  links: ChainLinkX[];
  ends: "digit" | "cell" | "cross";
}

function conclusion(e: ChainX, elims: readonly Elimination[], p: Puzzle): string[] {
  const first = e.nodes[0]!;
  const last = e.nodes[e.nodes.length - 1]!;
  const a = cellName(first.cell);
  const b = cellName(last.cell);
  const out = [`So if ${a} isn't ${first.digit}, then ${b} is ${last.digit}: either ${isText(first)} or ${isText(last)} (maybe both).`];
  if (e.ends === "digit") {
    const targets = elimCells(elims);
    out.push(`${sees(targets)} both ${a} and ${b}, so ${pron(targets)} can't be ${first.digit}.`);
  } else if (e.ends === "cell") {
    out.push(`Either way ${a} is ${first.digit} or ${last.digit}, so its other ${plural(elims.length, "candidate", "candidates")} (${digitList(elims.map((x) => x.digit))}) can go.`);
  } else {
    const rel = relation(first.cell, last.cell, p);
    for (const x of elims) {
      const self = x.cell === last.cell ? last : first;
      const other = x.cell === last.cell ? first : last;
      out.push(
        `${cellName(x.cell)} can't be ${x.digit}: if ${isText(other)}, ${cellName(x.cell)} sees it (${rel}); if ${isText(self)}, it isn't ${x.digit}.`,
      );
    }
  }
  return out;
}

const chain: Template = (step, { puzzle }) => {
  const e = step.explain as unknown as ChainX;
  const first = e.nodes[0]!;
  const last = e.nodes[e.nodes.length - 1]!;
  const where =
    e.variant === "x-chain"
      ? `Look at the ${first.digit}s, starting from ${cellName(first.cell)}.`
      : e.variant === "xy-chain"
        ? `Look at the two-candidate cells, starting from ${cellName(first.cell)}.`
        : `Look at ${cellName(first.cell)} and ${cellName(last.cell)}.`;
  const what =
    e.variant === "x-chain"
      ? `Follow the ${first.digit}s along a chain: "only other place" links alternate with "can't both be" links.`
      : e.variant === "xy-chain"
        ? `Hop between cells with two candidates: each one forces the next.`
        : `Follow a chain of "if this isn't true, that must be" links between candidates.`;
  return {
    where,
    what,
    why: [...chainSentences(e.nodes, e.links, puzzle), ...conclusion(e, step.eliminations, puzzle)],
    do: removeSentence(step.eliminations),
  };
};

export const ADVANCED_TEMPLATES: Record<string, Template> = {
  "x-wing": fish,
  swordfish: fish,
  jellyfish: fish,
  "finned-x-wing": finnedFish,
  "finned-swordfish": finnedFish,
  skyscraper,
  "two-string-kite": twoStringKite,
  "empty-rectangle": emptyRectangle,
  "xy-wing": xyWing,
  "xyz-wing": xyzWing,
  "w-wing": wWing,
  "simple-coloring": simpleColoring,
  "unique-rectangle": uniqueRectangle,
  "bug-plus-one": bugPlusOne,
  "x-chain": chain,
  "xy-chain": chain,
  aic: chain,
};
