import { ALL_HOUSES, houseCells } from "./geometry";
import type { Grid, Puzzle } from "./types";

export interface ValidationIssue {
  code: string;
  message: string;
}

/** Structural checks: cages partition all 81 cells, sizes/sums are achievable. */
export function validatePuzzle(p: Puzzle): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const owner = new Array<number>(81).fill(-1);
  for (const cage of p.cages) {
    if (cage.cells.length < 1 || cage.cells.length > 9)
      issues.push({ code: "cage-size", message: `Cage ${cage.id} has ${cage.cells.length} cells` });
    const n = cage.cells.length;
    const lo = (n * (n + 1)) / 2;
    const hi = (n * (19 - n)) / 2;
    if (cage.sum < lo || cage.sum > hi)
      issues.push({ code: "cage-sum", message: `Cage ${cage.id} sum ${cage.sum} impossible for ${n} cells` });
    for (const c of cage.cells) {
      if (c < 0 || c > 80) issues.push({ code: "cell-range", message: `Cage ${cage.id} has cell ${c}` });
      else if (owner[c] !== -1)
        issues.push({ code: "overlap", message: `Cell ${c} in cages ${owner[c]} and ${cage.id}` });
      else owner[c] = cage.id;
    }
  }
  const missing = owner.flatMap((o, c) => (o === -1 ? [c] : []));
  if (missing.length) issues.push({ code: "uncovered", message: `Cells not in any cage: ${missing.join(",")}` });
  const total = p.cages.reduce((a, c) => a + c.sum, 0);
  if (total !== 405) issues.push({ code: "total", message: `Cage sums total ${total}, expected 405` });
  return issues;
}

export function parseSolution(s: string): Grid {
  if (!/^[1-9]{81}$/.test(s)) throw new Error("Solution must be 81 digits 1-9");
  return Uint8Array.from(s, (ch) => Number(ch));
}

/** Full check of a complete grid against sudoku + killer rules. */
export function checkSolution(p: Puzzle, g: Grid): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const h of ALL_HOUSES) {
    const seen = new Set(houseCells(h).map((c) => g[c]));
    if (seen.size !== 9 || seen.has(0))
      issues.push({ code: "house", message: `${h.kind} ${h.index + 1} is not 1-9` });
  }
  for (const cage of p.cages) {
    const vals = cage.cells.map((c) => g[c] ?? 0);
    if (new Set(vals).size !== vals.length)
      issues.push({ code: "cage-repeat", message: `Cage ${cage.id} repeats a digit` });
    const sum = vals.reduce((a, b) => a + b, 0);
    if (sum !== cage.sum) issues.push({ code: "cage-sum", message: `Cage ${cage.id} sums to ${sum}, not ${cage.sum}` });
  }
  for (const [k, v] of Object.entries(p.givens ?? {}))
    if (g[Number(k)] !== v) issues.push({ code: "given", message: `Given at ${k} overwritten` });
  return issues;
}
