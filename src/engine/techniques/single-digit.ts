/**
 * Single-digit patterns built from strong links (a house with exactly two places for d):
 *
 * - Skyscraper: two parallel lines, each with two places for d; one end of each lines up. One of
 *   the two other ends ("tops") must be d, so cells seeing both tops lose d.
 * - Two-string kite: a row pair and a column pair with one end each in the same box. One of the
 *   two far ends must be d.
 * - Empty rectangle: a box whose d's all sit on one row and one column of the box, plus a line pair
 *   with one end on that row (or column). The cell where the pair's other line crosses the box's
 *   column (or row) can't be d.
 */
import { boxOf, cellAt, colOf, rowOf } from "../geometry";
import type { SolverState } from "../state";
import type { CellId, ChainLink, Digit, Elimination, Step } from "../types";
import { cellsAt, elimSeeingAll, housePositions, openDigits, withContext } from "./links";
import type { Technique } from "./types";
import { bit, COLS, elimMarks, house, makeStep, marksFor, popcount, ROWS } from "./util";

const strong = (a: CellId, b: CellId, d: Digit): ChainLink => ({ from: { cell: a, digit: d }, to: { cell: b, digit: d }, strong: true });
const weak = (a: CellId, b: CellId, d: Digit): ChainLink => ({ from: { cell: a, digit: d }, to: { cell: b, digit: d }, strong: false });

export const skyscraper: Technique = {
  id: "skyscraper",
  tier: 4,
  rating: 4.0,
  find(s) {
    const pos = housePositions(s);
    for (const d of openDigits(s)) {
      for (const lines of [ROWS, COLS]) {
        const pairs = lines.filter((h) => popcount(pos[h * 10 + d]!) === 2);
        for (let i = 0; i < pairs.length; i++) {
          for (let j = i + 1; j < pairs.length; j++) {
            const h1 = pairs[i]!;
            const h2 = pairs[j]!;
            const m1 = pos[h1 * 10 + d]!;
            const m2 = pos[h2 * 10 + d]!;
            const shared = m1 & m2;
            if (popcount(shared) !== 1) continue;
            const base: [CellId, CellId] = [cellsAt(h1, shared)[0]!, cellsAt(h2, shared)[0]!];
            const tops: [CellId, CellId] = [cellsAt(h1, m1 & ~shared)[0]!, cellsAt(h2, m2 & ~shared)[0]!];
            const elims = elimSeeingAll(s, tops, d, [...base, ...tops]);
            if (!elims.length) continue;
            const baseLine = h1 < 9 ? 9 + colOf(base[0]) : rowOf(base[0]);
            return makeStep({
              technique: "skyscraper",
              tier: 4,
              rating: 4.0,
              eliminations: elims,
              focus: { cells: [...base, ...tops].sort((a, b) => a - b), cages: [], houses: [house(h1), house(h2)] },
              explain: { kind: "skyscraper", digit: d, lines: [house(h1), house(h2)], baseLine: house(baseLine), base, tops },
              marks: withContext(s, d, [...marksFor(s, base, bit(d), "key"), ...marksFor(s, tops, bit(d), "alt"), ...elimMarks(elims)]),
              links: [strong(tops[0], base[0], d), weak(base[0], base[1], d), strong(base[1], tops[1], d)],
            });
          }
        }
      }
    }
    return null;
  },
};

export const twoStringKite: Technique = {
  id: "two-string-kite",
  tier: 4,
  rating: 4.1,
  find(s) {
    const pos = housePositions(s);
    for (const d of openDigits(s)) {
      const rows = ROWS.filter((h) => popcount(pos[h * 10 + d]!) === 2);
      const cols = COLS.filter((h) => popcount(pos[h * 10 + d]!) === 2);
      for (const r of rows) {
        const rc = cellsAt(r, pos[r * 10 + d]!);
        for (const c of cols) {
          const cc = cellsAt(c, pos[c * 10 + d]!);
          for (let ri = 0; ri < 2; ri++) {
            for (let ci = 0; ci < 2; ci++) {
              const rIn = rc[ri]!;
              const cIn = cc[ci]!;
              const rFar = rc[1 - ri]!;
              const cFar = cc[1 - ci]!;
              if (new Set([rIn, cIn, rFar, cFar]).size !== 4) continue;
              const box = boxOf(rIn);
              if (boxOf(cIn) !== box || boxOf(rFar) === box || boxOf(cFar) === box) continue;
              const elims = elimSeeingAll(s, [rFar, cFar], d, [rIn, cIn, rFar, cFar]);
              if (!elims.length) continue;
              const cells = [rIn, rFar, cIn, cFar];
              return makeStep({
                technique: "two-string-kite",
                tier: 4,
                rating: 4.1,
                eliminations: elims,
                focus: { cells: [...cells].sort((a, b) => a - b), cages: [], houses: [house(r), house(c), house(18 + box)] },
                explain: {
                  kind: "two-string-kite",
                  digit: d,
                  row: house(r),
                  col: house(c),
                  box: house(18 + box),
                  rowCells: [rIn, rFar],
                  colCells: [cIn, cFar],
                },
                marks: withContext(s, d, [...marksFor(s, [rIn, cIn], bit(d), "key"), ...marksFor(s, [rFar, cFar], bit(d), "alt"), ...elimMarks(elims)]),
                links: [strong(rFar, rIn, d), weak(rIn, cIn, d), strong(cIn, cFar, d)],
              });
            }
          }
        }
      }
    }
    return null;
  },
};

interface ErHit {
  pair: [CellId, CellId];
  line: number;
  target: CellId;
}

/** Line pairs that complete an empty rectangle at box b with its cross at (row R, column C). */
function erPartners(pos: Uint16Array, d: Digit, b: number, R: number, C: number): ErHit[] {
  const out: ErHit[] = [];
  const band = Math.floor(b / 3);
  const stack = b % 3;
  // A column outside the box's stack whose two d's include (R, col): the other end's row meets column C.
  for (let col = 0; col < 9; col++) {
    if (Math.floor(col / 3) === stack) continue;
    const h = 9 + col;
    if (popcount(pos[h * 10 + d]!) !== 2 || !(pos[h * 10 + d]! & (1 << R))) continue;
    const far = cellsAt(h, pos[h * 10 + d]! & ~(1 << R))[0]!;
    if (Math.floor(rowOf(far) / 3) === band) continue;
    out.push({ pair: [cellAt(R, col), far], line: h, target: cellAt(rowOf(far), C) });
  }
  // A row outside the box's band whose two d's include (row, C): the other end's column meets row R.
  for (let row = 0; row < 9; row++) {
    if (Math.floor(row / 3) === band) continue;
    if (popcount(pos[row * 10 + d]!) !== 2 || !(pos[row * 10 + d]! & (1 << C))) continue;
    const far = cellsAt(row, pos[row * 10 + d]! & ~(1 << C))[0]!;
    if (Math.floor(colOf(far) / 3) === stack) continue;
    out.push({ pair: [cellAt(row, C), far], line: row, target: cellAt(R, colOf(far)) });
  }
  return out;
}

export const emptyRectangle: Technique = {
  id: "empty-rectangle",
  tier: 4,
  rating: 4.5,
  find(s) {
    const pos = housePositions(s);
    for (const d of openDigits(s)) {
      for (let b = 0; b < 9; b++) {
        const boxCells = cellsAt(18 + b, pos[(18 + b) * 10 + d]!);
        if (boxCells.length < 2) continue;
        const r0 = Math.floor(b / 3) * 3;
        const c0 = (b % 3) * 3;
        for (let R = r0; R < r0 + 3; R++) {
          for (let C = c0; C < c0 + 3; C++) {
            if (!boxCells.every((x) => rowOf(x) === R || colOf(x) === C)) continue;
            if (!boxCells.some((x) => rowOf(x) === R && colOf(x) !== C)) continue;
            if (!boxCells.some((x) => colOf(x) === C && rowOf(x) !== R)) continue;
            for (const hit of erPartners(pos, d, b, R, C)) {
              if (s.grid[hit.target] || !(s.cand[hit.target]! & bit(d))) continue;
              const elims: Elimination[] = [{ cell: hit.target, digit: d }];
              return erStep(s, d, b, R, C, boxCells, hit, elims);
            }
          }
        }
      }
    }
    return null;
  },
};

function erStep(s: SolverState, d: Digit, b: number, R: number, C: number, boxCells: CellId[], hit: ErHit, elims: Elimination[]): Step {
  return makeStep({
    technique: "empty-rectangle",
    tier: 4,
    rating: 4.5,
    eliminations: elims,
    focus: { cells: [...boxCells, ...hit.pair].sort((x, y) => x - y), cages: [], houses: [house(18 + b), house(hit.line)] },
    explain: {
      kind: "empty-rectangle",
      digit: d,
      box: house(18 + b),
      boxRow: house(R),
      boxCol: house(9 + C),
      boxCells,
      pair: hit.pair,
      pairLine: house(hit.line),
      target: hit.target,
    },
    marks: withContext(s, d, [...marksFor(s, boxCells, bit(d), "key"), ...marksFor(s, hit.pair, bit(d), "alt"), ...elimMarks(elims)]),
    links: [strong(hit.pair[0], hit.pair[1], d)],
  });
}
