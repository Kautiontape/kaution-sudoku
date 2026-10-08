/** Helpers for hand-building advanced-technique fixtures on an otherwise open board. */
import { cellName } from "../../src/engine/geometry";
import type { SolverState } from "../../src/engine/state";
import type { CandidateMark, Step } from "../../src/engine/types";
import { cell } from "./helpers";

export const rowCells = (r: number): string[] => Array.from({ length: 9 }, (_, i) => `r${r}c${i + 1}`);
export const colCells = (c: number): string[] => Array.from({ length: 9 }, (_, i) => `r${i + 1}c${c}`);
export const boxCells = (b: number): string[] => {
  const r0 = Math.floor((b - 1) / 3) * 3;
  const c0 = ((b - 1) % 3) * 3;
  return Array.from({ length: 9 }, (_, i) => `r${r0 + Math.floor(i / 3) + 1}c${c0 + (i % 3) + 1}`);
};

/** Remove digit d from every cell in `cells` except those in `keep`. */
export function keepOnly(s: SolverState, d: number, cells: string[], keep: string[]): void {
  for (const n of cells) if (!keep.includes(n)) s.cand[cell(n)]! &= ~(1 << d);
}

/** Row r keeps digit d only in the given columns. */
export const rowOnly = (s: SolverState, d: number, r: number, cols: number[]): void =>
  keepOnly(s, d, rowCells(r), cols.map((c) => `r${r}c${c}`));

/** Column c keeps digit d only in the given rows. */
export const colOnly = (s: SolverState, d: number, c: number, rows: number[]): void =>
  keepOnly(s, d, colCells(c), rows.map((r) => `r${r}c${c}`));

/** Box b (1..9) keeps digit d only in the named cells. */
export const boxOnly = (s: SolverState, d: number, b: number, keep: string[]): void => keepOnly(s, d, boxCells(b), keep);

/** "r1c2-5:key" strings for the marks with the given roles, sorted. */
export function marksOf(step: Step | null, roles: CandidateMark["role"][]): string[] {
  return (step?.marks ?? [])
    .filter((m) => roles.includes(m.role))
    .map((m) => `${cellName(m.cell)}-${m.digit}:${m.role}`)
    .sort();
}

/** No candidate carries two marks. */
export function marksUnique(step: Step | null): boolean {
  const keys = (step?.marks ?? []).map((m) => m.cell * 10 + m.digit);
  return new Set(keys).size === keys.length;
}

export const linkStrings = (step: Step | null): string[] =>
  (step?.links ?? []).map((l) => `${cellName(l.from.cell)}-${l.from.digit}${l.strong ? "=" : "-"}${cellName(l.to.cell)}-${l.to.digit}`);
