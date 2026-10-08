/**
 * Worked examples for the Learn screen: a real position (harvested from the packs by
 * scripts/harvest-examples.ts) drawn with the same hint visuals the game uses, plus the
 * template-generated explanation, its square names coloured to match the rings on the board.
 */
import type { SudokuHint } from "../../engine/hints/index";
import { templateFor } from "../../engine/hints/registry";
import { decodeSudoku, type SudokuPackEntry } from "../../engine/pack";
import type { QueensHint } from "../../engine/queens/hints";
import { stepText } from "../../engine/queens/hints";
import { decodeQueens, type QueensPackEntry } from "../../engine/queens/pack";
import type { QStep } from "../../engine/queens/types";
import type { Step } from "../../engine/types";
import { ladderTexts, refNodes } from "../cell-refs";
import { h } from "../dom";
import { REGION_COLORS } from "../palette";
import { QueensBoard } from "./queens-board";
import { SudokuBoard } from "./sudoku-board";

interface Examples {
  sudoku: Record<string, { puzzle: SudokuPackEntry; grid: string; cand: number[]; step: Step }>;
  queens: Record<string, { puzzle: QueensPackEntry; marks: number[]; step: QStep }>;
}

let loaded: Promise<Examples | null> | null = null;

export function loadExamples(): Promise<Examples | null> {
  loaded ??= fetch(new URL("packs/examples.json", document.baseURI).href)
    .then((r) => (r.ok ? (r.json() as Promise<Examples>) : null))
    .catch(() => null);
  return loaded;
}

export function hasExample(ex: Examples | null, id: string, family: string): boolean {
  if (!ex) return false;
  return family === "queens" ? id in ex.queens : id in ex.sudoku;
}

/** Render the example for a technique into a fresh element. */
export function renderExample(ex: Examples, id: string, family: string): HTMLElement {
  if (family === "queens") {
    const e = ex.queens[id]!;
    const puzzle = decodeQueens(e.puzzle);
    const board = new QueensBoard(puzzle, { onTap: () => {}, onDoubleTap: () => {}, onLong: () => {}, onDrag: () => {} });
    board.render({ marks: Uint8Array.from(e.marks), attacked: null, conflicts: new Set(), wrong: new Set() });
    const names = { region: (i: number) => REGION_COLORS[i % REGION_COLORS.length]!.name };
    const text = stepText(e.step, puzzle, names);
    const hint = { kind: "step", title: "", ladder: text, step: e.step } as QueensHint;
    board.showHint(hint, 4);
    return wrap(board.el, text.why, text.do, board.refColors(ladderTexts(text, 4)), (name) => board.flashRef(name));
  }
  const e = ex.sudoku[id]!;
  const puzzle = decodeSudoku(e.puzzle);
  const board = new SudokuBoard(puzzle, () => {});
  const grid = Uint8Array.from(e.grid, (ch) => Number(ch));
  const cand = Uint16Array.from(e.cand);
  const given = new Uint8Array(81);
  for (const k of Object.keys(puzzle.givens ?? {})) given[Number(k)] = 1;
  // Singles read best on a clean board; everything else shows full pencil marks, SudokuWiki-style.
  const notes = e.step.tier <= 1 ? new Uint16Array(81) : cand;
  board.render({
    grid,
    notes,
    given,
    solution: Uint8Array.from(puzzle.solution ?? "", (ch) => Number(ch)),
    selected: null,
    highlightDigit: 0,
    showWrong: false,
    cageTint: true,
  });
  const text = templateFor(e.step.technique)(e.step, { puzzle });
  const hint = { kind: "step", title: "", ladder: text, step: e.step, cells: e.step.focus.cells } as SudokuHint;
  requestAnimationFrame(() => board.showHint(hint, 4, cand));
  return wrap(board.el, text.why, text.do, board.refColors(ladderTexts(text, 4)), (name) => board.flashRef(name));
}

function wrap(boardEl: HTMLElement, why: string[], doText: string, colors: ReadonlyMap<string, string>, onRef: (name: string) => void): HTMLElement {
  const para = (p: string, cls?: string) => h("p", cls ? { class: cls } : null, ...refNodes(p, colors, onRef));
  return h(
    "div",
    { class: "example" },
    h("div", { class: "example-board" }, boardEl),
    h("div", { class: "example-text" }, ...why.map((p) => para(p)), para(doText, "example-do")),
  );
}
