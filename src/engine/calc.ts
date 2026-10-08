/**
 * Calculator "tape": a signed list of terms the player builds by tapping.
 *
 * Terms are literals, cages (value = clue), or cells (value = placed digit, or a symbol if empty).
 * If every term resolves to a number, the result is a number.
 * If any term is a symbol, the tape is read as an equation `tape = 0`, i.e. "what's left over
 * is exactly these cells". It is normalized so subtracted cells (innies) sit on the left and
 * added cells (outies) on the right:
 *
 *   45 − [12] − [21] − 3 − r3c2 − r3c3   →   r3c2 + r3c3 = 9
 *   45 − [20] − [17] − r6c7 + r5c9       →   r6c7 = 8 + r5c9
 */
import { cellName } from "./geometry";
import type { CellId, Grid, Puzzle } from "./types";

export type Sign = 1 | -1;

export type Term =
  | { sign: Sign; kind: "literal"; value: number }
  | { sign: Sign; kind: "cage"; cageId: number }
  | { sign: Sign; kind: "cell"; cell: CellId };

export interface SymbolTerm {
  cell: CellId;
  /** Net coefficient after combining duplicates. Never 0. */
  coef: number;
}

export type TapeResult =
  | { kind: "number"; value: number }
  | {
      kind: "equation";
      /** Cells on the left, each with a positive coefficient. */
      left: SymbolTerm[];
      /** Constant on the right. */
      constant: number;
      /** Cells on the right (added to the constant), each with a positive coefficient. */
      right: SymbolTerm[];
      /** When the equation pins a single cell to a number, that value; else null. */
      solved: { cell: CellId; value: number; valid: boolean } | null;
    };

export interface CalcContext {
  puzzle: Puzzle;
  /** Current digits, 0 = empty. Givens should already be included. */
  grid: Grid;
  /** Extra cages (e.g. player-pinned virtual cages) addressable by id. */
  extraCages?: Puzzle["cages"];
}

export class UnknownCageError extends Error {}

export function evaluateTape(terms: Term[], ctx: CalcContext): TapeResult {
  let constant = 0;
  const coefs = new Map<CellId, number>();
  const cages = [...ctx.puzzle.cages, ...(ctx.extraCages ?? [])];

  for (const t of terms) {
    if (t.kind === "literal") constant += t.sign * t.value;
    else if (t.kind === "cage") {
      const cage = cages.find((c) => c.id === t.cageId);
      if (!cage) throw new UnknownCageError(`No cage with id ${t.cageId}`);
      constant += t.sign * cage.sum;
    } else {
      const v = ctx.grid[t.cell] ?? 0;
      if (v > 0) constant += t.sign * v;
      else coefs.set(t.cell, (coefs.get(t.cell) ?? 0) + t.sign);
    }
  }

  const symbols = [...coefs.entries()]
    .filter(([, c]) => c !== 0)
    .map(([cell, coef]) => ({ cell, coef }))
    .sort((a, b) => a.cell - b.cell);

  if (symbols.length === 0) return { kind: "number", value: constant };

  // tape = constant + Σ coef·x = 0  →  Σ(−coef)·x [coef<0] = constant + Σ coef·x [coef>0]
  let left = symbols.filter((s) => s.coef < 0).map((s) => ({ cell: s.cell, coef: -s.coef }));
  let right = symbols.filter((s) => s.coef > 0);
  let k = constant;
  if (left.length === 0) {
    // Only added cells: flip sides so the cells read on the left.
    left = right;
    right = [];
    k = -constant;
  }

  let solved: { cell: CellId; value: number; valid: boolean } | null = null;
  if (left.length === 1 && right.length === 0) {
    const only = left[0]!;
    const value = k / only.coef;
    solved = { cell: only.cell, value, valid: Number.isInteger(value) && value >= 1 && value <= 9 };
  }

  return { kind: "equation", left, constant: k, right, solved };
}

function symText(s: SymbolTerm): string {
  return s.coef === 1 ? cellName(s.cell) : `${s.coef}·${cellName(s.cell)}`;
}

/** Human-readable result, e.g. "25" or "r3c2 + r3c3 = 9" or "r6c7 = 8 + r5c9". */
export function formatResult(r: TapeResult): string {
  if (r.kind === "number") return String(r.value);
  const lhs = r.left.map(symText).join(" + ");
  const rhsParts = [String(r.constant), ...r.right.map(symText)];
  return `${lhs} = ${rhsParts.join(" + ")}`;
}

/** Human-readable tape, e.g. "45 − [12] − r3c4". Cage terms show their clue. */
export function formatTape(terms: Term[], ctx: CalcContext): string {
  const cages = [...ctx.puzzle.cages, ...(ctx.extraCages ?? [])];
  return terms
    .map((t, i) => {
      const op = t.sign === 1 ? (i === 0 ? "" : "+ ") : "− ";
      if (t.kind === "literal") return `${op}${t.value}`;
      if (t.kind === "cage") return `${op}[${cages.find((c) => c.id === t.cageId)?.sum ?? "?"}]`;
      const v = ctx.grid[t.cell] ?? 0;
      return `${op}${v > 0 ? `${cellName(t.cell)}=${v}` : cellName(t.cell)}`;
    })
    .join(" ");
}

/** The cages a selection touches, added up. */
export interface CageTally {
  /** Each cage once, in the order the selection first reached it. */
  cages: Puzzle["cages"];
  /** Their clues added up. */
  sum: number;
  /** How many cells they cover. */
  cells: number;
  /** Of those, how many are still empty, and what those have left to make. */
  open: number;
  rem: number;
}

/**
 * The total of the printed cages the picked cells touch, however many of each cage's cells are
 * picked. Null for fewer than two cages: one cage already has its own readout.
 */
export function cageTally(cages: Puzzle["cages"], picked: readonly CellId[], grid: Grid): CageTally | null {
  const hit: Puzzle["cages"] = [];
  for (const c of picked) {
    const cage = cages.find((k) => !k.virtual && k.cells.includes(c));
    if (cage && !hit.includes(cage)) hit.push(cage);
  }
  if (hit.length < 2) return null;
  const t: CageTally = { cages: hit, sum: 0, cells: 0, open: 0, rem: 0 };
  for (const k of hit) {
    t.sum += k.sum;
    t.rem += k.sum;
    t.cells += k.cells.length;
    for (const c of k.cells) {
      if (grid[c]) t.rem -= grid[c]!;
      else t.open++;
    }
  }
  return t;
}
