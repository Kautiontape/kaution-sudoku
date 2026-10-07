/** Test helpers for building solver states by hand. */
import { maskOf } from "../../src/engine/combos";
import { cellName, parseCellName } from "../../src/engine/geometry";
import { createState, type SolverState } from "../../src/engine/state";
import type { Cage, Puzzle, Step } from "../../src/engine/types";

export const cell = (name: string): number => {
  const id = parseCellName(name);
  if (id === null) throw new Error(`bad cell ${name}`);
  return id;
};

/** Classic puzzle from an 81-char string ('.' or '0' = empty). */
export function classic(givens: string, solution?: string): Puzzle {
  const g: Record<number, number> = {};
  for (let i = 0; i < 81; i++) if (givens[i] && givens[i] !== "0" && givens[i] !== ".") g[i] = Number(givens[i]);
  return { id: "t", kind: "classic", cages: [], givens: g, solution };
}

/** Puzzle with placements given as {"r1c1": 5, ...}. */
export function withDigits(digits: Record<string, number>, cages: Cage[] = []): Puzzle {
  const g: Record<number, number> = {};
  for (const [k, v] of Object.entries(digits)) g[cell(k)] = v;
  return { id: "t", kind: cages.length ? "killer" : "classic", cages, givens: g };
}

/** State with candidate overrides, e.g. {"r1c1": "129"} (digits as a string). */
export function stateWith(p: Puzzle, cands: Record<string, string> = {}): SolverState {
  const s = createState(p);
  for (const [k, v] of Object.entries(cands)) s.cand[cell(k)] = maskOf([...v].map(Number));
  return s;
}

/** Sorted "r1c1-5" strings for compact assertions. */
export const elims = (step: Step | null): string[] =>
  (step?.eliminations ?? []).map((e) => `${cellName(e.cell)}-${e.digit}`).sort();

export const places = (step: Step | null): string[] =>
  (step?.placements ?? []).map((e) => `${cellName(e.cell)}=${e.digit}`).sort();

/** Typed access to a step's structured explanation. */
export const explainOf = <T>(step: Step | null): T => step!.explain as unknown as T;

export const cage = (id: number, sum: number, names: string[]): Cage => ({ id, sum, cells: names.map(cell) });
