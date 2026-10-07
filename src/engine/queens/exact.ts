/**
 * Exact queens solver: backtracking row by row with column/region bitmasks and the no-touch rule
 * against the previous row (one queen per row and column means touching can only happen between
 * neighbouring rows, diagonally). Used for uniqueness and validation, never for hints.
 */
import type { ValidationIssue } from "../validate";
import { cellAt, isConnected, regionCells } from "./geometry";
import { MAX_N, MIN_N, type QueensPuzzle } from "./types";

type Layout = Pick<QueensPuzzle, "n" | "regions">;

/** Up to `limit` solutions (solution[row] = column), in search order. */
export function findSolutions(p: Layout, limit = 2): number[][] {
  const out: number[][] = [];
  search(p, limit, out);
  return out;
}

/** Number of solutions, counting no further than `limit`. */
export function countSolutions(p: Layout, limit = 2): number {
  return search(p, limit, null);
}

/** The first solution found, or null if there is none. */
export function solve(p: Layout): number[] | null {
  return findSolutions(p, 1)[0] ?? null;
}

function search(p: Layout, limit: number, out: number[][] | null): number {
  const { n, regions } = p;
  if (regions.length !== n * n) throw new Error(`Expected ${n * n} region entries, got ${regions.length}`);
  if (limit <= 0) return 0;
  // reach[row][g] = columns where region g still has a cell in rows >= row
  const reach: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(n).fill(0));
  for (let r = n - 1; r >= 0; r--) {
    const here = reach[r]!;
    const below = reach[r + 1]!;
    for (let g = 0; g < n; g++) here[g] = below[g]!;
    for (let c = 0; c < n; c++) {
      const g = regions[cellAt(r, c, n)]!;
      here[g] = here[g]! | (1 << c);
    }
  }
  const cols = new Array<number>(n).fill(-1);
  let count = 0;

  const rec = (row: number, colMask: number, regMask: number): boolean => {
    if (row === n) {
      count++;
      out?.push(cols.slice());
      return count >= limit;
    }
    // Every region still without a queen needs a free column somewhere at or below this row.
    const rowReach = reach[row]!;
    for (let g = 0; g < n; g++) if (!((regMask >> g) & 1) && (rowReach[g]! & ~colMask) === 0) return false;
    const prev = row > 0 ? cols[row - 1]! : -10;
    for (let c = 0; c < n; c++) {
      if ((colMask >> c) & 1 || (c >= prev - 1 && c <= prev + 1)) continue;
      const g = regions[row * n + c]!;
      if ((regMask >> g) & 1) continue;
      cols[row] = c;
      if (rec(row + 1, colMask | (1 << c), regMask | (1 << g))) return true;
    }
    return false;
  };

  rec(0, 0, 0);
  return count;
}

/** True if `sol` puts one queen in every row, column and region with no two touching. */
export function isValidSolution(p: Layout, sol: readonly number[]): boolean {
  const { n, regions } = p;
  if (sol.length !== n) return false;
  const colSeen = new Set<number>();
  const regionSeen = new Set<number>();
  for (let r = 0; r < n; r++) {
    const c = sol[r]!;
    if (!Number.isInteger(c) || c < 0 || c >= n || colSeen.has(c)) return false;
    if (r > 0 && Math.abs(c - sol[r - 1]!) < 2) return false;
    const g = regions[cellAt(r, c, n)]!;
    if (regionSeen.has(g)) return false;
    colSeen.add(c);
    regionSeen.add(g);
  }
  return true;
}

/**
 * Structural checks: size, n non-empty connected regions, and a stored solution that obeys every
 * rule. Uniqueness is not checked here (use `countSolutions`).
 */
export function validateQueensPuzzle(p: QueensPuzzle): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { n, regions, solution } = p;
  if (!Number.isInteger(n) || n < MIN_N || n > MAX_N)
    issues.push({ code: "size", message: `Board size ${n} is outside ${MIN_N}..${MAX_N}` });
  if (!Number.isInteger(n) || n < 1 || regions.length !== n * n) {
    issues.push({ code: "regions-length", message: `Expected ${n}×${n} region entries, got ${regions.length}` });
    return issues;
  }

  const bad = regions.flatMap((g, c) => (Number.isInteger(g) && g >= 0 && g < n ? [] : [c]));
  if (bad.length) issues.push({ code: "region-range", message: `Cells with a region outside 0..${n - 1}: ${bad.join(",")}` });
  for (let g = 0; g < n; g++) {
    const cells = regionCells(regions, g);
    if (cells.length === 0) issues.push({ code: "region-empty", message: `Region ${g} has no cells` });
    else if (!isConnected(cells, n)) issues.push({ code: "region-disconnected", message: `Region ${g} is not connected` });
  }

  if (solution.length !== n) {
    issues.push({ code: "solution-length", message: `Solution has ${solution.length} rows, expected ${n}` });
    return issues;
  }
  const outside = solution.flatMap((c, r) => (Number.isInteger(c) && c >= 0 && c < n ? [] : [r]));
  if (outside.length) {
    issues.push({ code: "solution-range", message: `Solution columns out of range in rows ${outside.join(",")}` });
    return issues;
  }
  if (new Set(solution).size !== n) issues.push({ code: "solution-column", message: "Solution repeats a column" });
  for (let r = 1; r < n; r++)
    if (Math.abs(solution[r]! - solution[r - 1]!) < 2)
      issues.push({ code: "solution-touch", message: `Solution queens in rows ${r} and ${r + 1} touch` });
  const perRegion = new Array<number>(n).fill(0);
  solution.forEach((c, r) => {
    const g = regions[cellAt(r, c, n)]!;
    if (g >= 0 && g < n) perRegion[g]!++;
  });
  perRegion.forEach((count, g) => {
    if (count !== 1) issues.push({ code: "solution-region", message: `Solution has ${count} queens in region ${g}` });
  });
  return issues;
}
