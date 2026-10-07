/**
 * Compact JSON for Queens packs: { id, n, g: regions (one char per cell), s: solution columns,
 * d difficulty, t tier, r rating, x techniques, k step count }.
 */
import type { Difficulty } from "../types";
import { decodeRegions, encodeRegions } from "./geometry";
import type { QueensPuzzle } from "./types";

export interface QueensPackEntry {
  id: string;
  n: number;
  g: string;
  s: number[];
  d?: Difficulty;
  t?: number;
  r?: number;
  x?: string[];
  k?: number;
}

export interface QueensPack {
  version: 1;
  mode: "queens";
  difficulty: Difficulty;
  puzzles: QueensPackEntry[];
}

export function encodeQueens(p: QueensPuzzle): QueensPackEntry {
  const e: QueensPackEntry = { id: p.id, n: p.n, g: encodeRegions(p.regions), s: [...p.solution] };
  const m = p.meta;
  if (m?.difficulty) e.d = m.difficulty;
  if (m?.tier !== undefined) e.t = m.tier;
  if (m?.rating !== undefined) e.r = Math.round(m.rating * 10) / 10;
  if (m?.techniques) e.x = m.techniques;
  if (m?.steps !== undefined) e.k = m.steps;
  return e;
}

export function decodeQueens(e: QueensPackEntry): QueensPuzzle {
  return {
    id: e.id,
    n: e.n,
    regions: decodeRegions(e.g),
    solution: [...e.s],
    meta: { difficulty: e.d, tier: e.t, rating: e.r, techniques: e.x, steps: e.k },
  };
}
