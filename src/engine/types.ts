/** 0..80, row-major. row = floor(id / 9), col = id % 9. */
export type CellId = number;
/** 1..9 */
export type Digit = number;

export interface Cage {
  id: number;
  sum: number;
  cells: CellId[];
  /** Player-pinned or solver-derived cage that isn't part of the printed puzzle. */
  virtual?: boolean;
}

export interface PuzzleMeta {
  seed?: number;
  tier?: number;
  techniques?: string[];
  breakIn?: string;
}

export interface Puzzle {
  id: string;
  cages: Cage[];
  /** CellId -> digit */
  givens?: Record<number, Digit>;
  /** 81-char string of digits 1-9 */
  solution?: string;
  meta?: PuzzleMeta;
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

export interface Step {
  technique: string;
  tier: number;
  placements: Placement[];
  eliminations: Elimination[];
  focus: {
    cells: CellId[];
    cages: number[];
    houses: House[];
  };
  explain: StepReason;
}
