/**
 * Compact JSON encoding for puzzle packs shipped in public/packs.
 *
 * Classic: { id, g: givens (81 chars, 0 = blank), s: solution, ...grade }
 * Killer:  { id, c: cage map (81 chars, one symbol per cage), u: cage sums in symbol order,
 *            g?: givens, s: solution, ...grade }
 * Grade fields: d difficulty, t tier, r rating, x techniques (first-use order), n step count.
 */
import type { Cage, Difficulty, Puzzle, PuzzleKind } from "./types";

export const CAGE_SYMBOLS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+,-./:;<=>?@[]^_{|}~";

export interface SudokuPackEntry {
  id: string;
  g?: string;
  s: string;
  c?: string;
  u?: number[];
  d?: Difficulty;
  t?: number;
  r?: number;
  x?: string[];
  n?: number;
}

export interface SudokuPack {
  version: 1;
  mode: PuzzleKind;
  difficulty: Difficulty;
  puzzles: SudokuPackEntry[];
}

function givensString(p: Puzzle): string {
  const out = new Array<string>(81).fill("0");
  for (const [k, v] of Object.entries(p.givens ?? {})) out[Number(k)] = String(v);
  return out.join("");
}

export function encodeSudoku(p: Puzzle): SudokuPackEntry {
  const e: SudokuPackEntry = { id: p.id, s: p.solution ?? "" };
  const g = givensString(p);
  if (/[1-9]/.test(g)) e.g = g;
  if (p.cages.length) {
    if (p.cages.length > CAGE_SYMBOLS.length) throw new Error("too many cages to encode");
    const map = new Array<string>(81).fill("?");
    p.cages.forEach((cage, i) => {
      for (const c of cage.cells) map[c] = CAGE_SYMBOLS[i]!;
    });
    e.c = map.join("");
    e.u = p.cages.map((c) => c.sum);
  }
  const m = p.meta;
  if (m?.difficulty) e.d = m.difficulty;
  if (m?.tier !== undefined) e.t = m.tier;
  if (m?.rating !== undefined) e.r = Math.round(m.rating * 10) / 10;
  if (m?.techniques) e.x = m.techniques;
  if (m?.steps !== undefined) e.n = m.steps;
  return e;
}

export function decodeSudoku(e: SudokuPackEntry): Puzzle {
  const givens: Record<number, number> = {};
  if (e.g) for (let i = 0; i < 81; i++) if (e.g[i] !== "0") givens[i] = Number(e.g[i]);
  const cages: Cage[] = [];
  if (e.c && e.u) {
    const byIndex = new Map<number, number[]>();
    for (let cell = 0; cell < 81; cell++) {
      const idx = CAGE_SYMBOLS.indexOf(e.c[cell]!);
      if (idx < 0) throw new Error(`bad cage symbol at ${cell}`);
      byIndex.set(idx, [...(byIndex.get(idx) ?? []), cell]);
    }
    e.u.forEach((sum, i) => cages.push({ id: i, sum, cells: byIndex.get(i) ?? [] }));
  }
  return {
    id: e.id,
    kind: cages.length ? "killer" : "classic",
    cages,
    givens,
    solution: e.s,
    meta: { difficulty: e.d, tier: e.t, rating: e.r, techniques: e.x, steps: e.n },
  };
}
