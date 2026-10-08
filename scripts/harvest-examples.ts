/**
 * Worked examples for the Learn screen: for every technique, a real position from the packs where
 * that technique is the next logical step. Writes public/packs/examples.json.
 *
 *   npx tsx scripts/harvest-examples.ts
 *
 * Among the first few occurrences of each technique, the one with the fewest eliminations wins —
 * small, readable examples teach best.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { nextStep } from "../src/engine/logical";
import { decodeSudoku, type SudokuPack, type SudokuPackEntry } from "../src/engine/pack";
import { nextStep as queensNext } from "../src/engine/queens/logical";
import { decodeQueens, type QueensPack, type QueensPackEntry } from "../src/engine/queens/pack";
import { applyStep as queensApply, initialState } from "../src/engine/queens/state";
import { CROSS, EMPTY, QUEEN, type QStep } from "../src/engine/queens/types";
import { applyStep, createState } from "../src/engine/state";
import { DIFFICULTIES, type Step } from "../src/engine/types";

export interface SudokuExample {
  puzzle: SudokuPackEntry;
  /** 81 chars, the digits on the board before the step. */
  grid: string;
  /** Candidates before the step (bitmask per cell). */
  cand: number[];
  step: Step;
}

export interface QueensExample {
  puzzle: QueensPackEntry;
  /** Marks before the step: queens placed and cells already ruled out. */
  marks: number[];
  step: QStep;
}

const OCCURRENCES = 8;
const sudoku: Record<string, SudokuExample & { seen: number }> = {};
const queens: Record<string, QueensExample & { seen: number }> = {};

function consider<T extends { seen: number }>(table: Record<string, T>, key: string, make: () => T, size: number, current?: T): void {
  if (!current) {
    table[key] = make();
    return;
  }
  current.seen++;
  if (current.seen > OCCURRENCES) return;
  const cur = (current as unknown as { step: { eliminations: unknown[] } }).step.eliminations.length;
  if (size < cur) table[key] = { ...make(), seen: current.seen };
}

for (const mode of ["classic", "killer"] as const)
  for (const d of DIFFICULTIES) {
    const file = `public/packs/${mode}-${d}.json`;
    if (!existsSync(file)) continue;
    const pack = JSON.parse(readFileSync(file, "utf8")) as SudokuPack;
    for (const entry of pack.puzzles) {
      const p = decodeSudoku(entry);
      const s = createState(p);
      for (let guard = 0; guard < 600; guard++) {
        const step = nextStep(s);
        if (!step) break;
        // Generic techniques: keep classic examples (cleaner boards) unless only killer has one.
        const key = step.technique;
        const prev = sudoku[key];
        if (!(prev && mode === "killer" && !key.startsWith("cage") && key !== "innies-outies"))
          consider(
            sudoku,
            key,
            () => ({ puzzle: entry, grid: Array.from(s.grid).join(""), cand: Array.from(s.cand), step, seen: 1 }),
            step.eliminations.length,
            prev,
          );
        applyStep(s, step);
      }
    }
  }

for (const d of DIFFICULTIES) {
  const file = `public/packs/queens-${d}.json`;
  if (!existsSync(file)) continue;
  const pack = JSON.parse(readFileSync(file, "utf8")) as QueensPack;
  for (const entry of pack.puzzles) {
    const p = decodeQueens(entry);
    let s = initialState(p);
    for (let guard = 0; guard < 400; guard++) {
      const step = queensNext(s);
      if (!step) break;
      const marks = Array.from(s.possible, (ok, c) => (s.queens[c] ? QUEEN : ok ? EMPTY : CROSS));
      consider(queens, step.technique, () => ({ puzzle: entry, marks, step, seen: 1 }), step.eliminations.length, queens[step.technique]);
      s = queensApply(s, step);
    }
  }
}

const strip = <T extends { seen: number }>(t: Record<string, T>) =>
  Object.fromEntries(Object.entries(t).map(([k, { seen: _seen, ...v }]) => [k, v]));
const out = { version: 1, sudoku: strip(sudoku), queens: strip(queens) };
writeFileSync("public/packs/examples.json", JSON.stringify(out) + "\n");
console.log(`examples: ${Object.keys(sudoku).length} sudoku, ${Object.keys(queens).length} queens`);
console.log("sudoku:", Object.keys(sudoku).sort().join(", "));
console.log("queens:", Object.keys(queens).sort().join(", "));
