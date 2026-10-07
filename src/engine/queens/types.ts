import type { Difficulty } from "../types";

/** 0..n*n-1, row-major: row = floor(cell / n), col = cell % n. */
export type QCell = number;

export interface QueensPuzzle {
  id: string;
  n: number;
  /** Region index 0..n-1 for each cell (row-major, length n*n). */
  regions: number[];
  /** solution[row] = column of that row's queen. */
  solution: number[];
  meta?: QueensMeta;
}

export interface QueensMeta {
  /** Seed that reproduces this puzzle with `generateQueens({ n, seed })`. */
  seed?: number;
  /** Hardest technique tier the logical solver needed. */
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
}

/** Board sizes the engine supports. */
export const MIN_N = 5;
export const MAX_N = 11;

/** Player marks per cell. */
export const EMPTY = 0,
  CROSS = 1,
  QUEEN = 2;
/** One mark per cell (EMPTY / CROSS / QUEEN), length n*n. */
export type Marks = Uint8Array;

export type UnitType = "row" | "col" | "region";
export interface Unit {
  type: UnitType;
  index: number;
}

export interface QStep {
  technique: string;
  tier: number;
  rating: number;
  /** Cells that must hold a queen. */
  placements: QCell[];
  /** Cells that cannot hold a queen (become crosses). */
  eliminations: QCell[];
  /**
   * What to highlight. rows/cols/regions are the units to look at (the "where" rung);
   * cells are the cells the reasoning is about (the "why" rung).
   */
  focus: { cells: QCell[]; rows: number[]; cols: number[]; regions: number[] };
  /** Structured data only, never prose. hints.ts turns it into text. */
  explain: { kind: string; [k: string]: unknown };
}
