/** 0..80, row-major. row = floor(id / 9), col = id % 9. */
export type CellId = number;
/** 1..9 */
export type Digit = number;

export type PuzzleKind = "classic" | "killer";

export type Difficulty = "easy" | "medium" | "hard" | "expert";
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard", "expert"];

export interface Cage {
  id: number;
  sum: number;
  cells: CellId[];
  /** Player-pinned or solver-derived cage that isn't part of the printed puzzle. */
  virtual?: boolean;
}

export interface PuzzleMeta {
  seed?: number;
  /** Hardest technique tier needed by the logical solver. */
  tier?: number;
  /** Hardest technique rating needed (finer than tier). */
  rating?: number;
  difficulty?: Difficulty;
  /** Distinct technique ids needed, in order of first use. */
  techniques?: string[];
  /** Technique id -> number of steps that used it. */
  counts?: Record<string, number>;
  /** Total logical steps to solve. */
  steps?: number;
  breakIn?: string;
  note?: string;
}

export interface Puzzle {
  id: string;
  /** Omitted in older data: inferred from cages (see `puzzleKind`). */
  kind?: PuzzleKind;
  /** Empty for classic sudoku. */
  cages: Cage[];
  /** CellId -> digit */
  givens?: Record<number, Digit>;
  /** 81-char string of digits 1-9 */
  solution?: string;
  meta?: PuzzleMeta;
}

export function puzzleKind(p: Puzzle): PuzzleKind {
  return p.kind ?? (p.cages.length > 0 ? "killer" : "classic");
}

/** 81 entries, 0 = empty. */
export type Grid = Uint8Array;

/** 81 entries, bit d (1..9) set = digit d possible. */
export type Candidates = Uint16Array;

export type HouseKind = "row" | "col" | "box";
export interface House {
  kind: HouseKind;
  /** 0..8 */
  index: number;
}

export interface Elimination {
  cell: CellId;
  digit: Digit;
}

export interface Placement {
  cell: CellId;
  digit: Digit;
}

/**
 * Structured reasoning for a step. Templates in hints.ts turn this into text.
 * Never put prose here.
 */
export type StepReason = Record<string, unknown> & { kind: string };

/**
 * Role of a candidate in a step, for SudokuWiki-style colouring:
 * - place: the digit being placed
 * - elim:  a candidate the step removes
 * - key:   a candidate that defines the pattern (the pair in a naked pair, the fish digit...)
 * - alt:   a secondary pattern candidate (wing pincers, fins)
 * - on/off: the two colours of a chain or colouring (alternate truth values)
 * - digit: context only — every candidate of the focus digit, so the pattern is visible
 */
export type MarkRole = "place" | "elim" | "key" | "alt" | "on" | "off" | "digit";

export interface CandidateMark {
  cell: CellId;
  digit: Digit;
  role: MarkRole;
}

export interface CandidateRef {
  cell: CellId;
  digit: Digit;
}

/** A link in a chain, drawn as an arrow. Strong = "if one is false the other is true". */
export interface ChainLink {
  from: CandidateRef;
  to: CandidateRef;
  strong: boolean;
}

export interface Step {
  technique: string;
  tier: number;
  /** Fine-grained difficulty (Sudoku Explainer-like scale) used for ordering and grading. */
  rating: number;
  placements: Placement[];
  eliminations: Elimination[];
  focus: {
    cells: CellId[];
    cages: number[];
    houses: House[];
  };
  explain: StepReason;
  /** Candidate colouring for the "why" rung. */
  marks?: CandidateMark[];
  /** Chain arrows for the "why" rung. */
  links?: ChainLink[];
  /** Filled cells whose digits justify the step (drawn as sources of "sight lines"). */
  sources?: CellId[];
  /** Cages the step derives (45 rule), drawn dashed on the board. */
  virtualCages?: Cage[];
}
