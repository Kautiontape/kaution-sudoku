/**
 * Puzzle packs: fetched once from public/packs, decoded, cached. Picks the next unsolved puzzle
 * in pack order (so everyone meets the same curated sequence), cycling when a pack is exhausted.
 */
import { decodeSudoku, type SudokuPack } from "../engine/pack";
import { decodeQueens, type QueensPack } from "../engine/queens/pack";
import type { QueensPuzzle } from "../engine/queens/types";
import type { Difficulty, Puzzle } from "../engine/types";

export type Mode = "classic" | "killer" | "queens";

const cache = new Map<string, Promise<unknown[]>>();

async function fetchPack(mode: Mode, difficulty: Difficulty): Promise<unknown[]> {
  const key = `${mode}-${difficulty}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(new URL(`packs/${key}.json`, document.baseURI).href)
      .then((r) => {
        if (!r.ok) throw new Error(`pack ${key}: ${r.status}`);
        return r.json() as Promise<SudokuPack | QueensPack>;
      })
      .then((pack) => pack.puzzles as unknown[]);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

export async function loadSudokuPack(mode: "classic" | "killer", difficulty: Difficulty): Promise<Puzzle[]> {
  return (await fetchPack(mode, difficulty)).map((e) => decodeSudoku(e as SudokuPack["puzzles"][number]));
}

export async function loadQueensPack(difficulty: Difficulty): Promise<QueensPuzzle[]> {
  return (await fetchPack("queens", difficulty)).map((e) => decodeQueens(e as QueensPack["puzzles"][number]));
}

/** First puzzle not yet solved (and not the one just played); cycles once all are solved. */
export function pickNext<T extends { id: string }>(list: readonly T[], solved: readonly string[], avoid?: string): T | null {
  if (!list.length) return null;
  const fresh = list.find((p) => !solved.includes(p.id) && p.id !== avoid);
  if (fresh) return fresh;
  const i = Math.max(0, list.findIndex((p) => p.id === avoid));
  return list[(i + 1) % list.length]!;
}
