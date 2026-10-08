/**
 * Uniqueness techniques (classic only; they assume the puzzle has exactly one solution).
 *
 * Deadly pattern: four cells at the corners of a rectangle spanning two rows, two columns and two
 * boxes, all holding only {a,b}. The a's and b's could be swapped and every row, column and box
 * would still be fine — two solutions. A proper puzzle can't end up there, so:
 *
 * - UR type 1: three corners are exactly {a,b}; the fourth can't be a or b.
 * - UR type 2: two corners on one side are {a,b}; the other two are both {a,b,c}. One of those two
 *   must be c, so cells seeing both lose c.
 * - UR type 4: two corners on one side are {a,b}; on the other side, a house holds a only in the
 *   two roof corners, so one of them is a — and neither may be b.
 * - BUG+1: every empty cell has two candidates except one with three. Without the extra digit the
 *   board would be a "bivalue graveyard" (two solutions or none), so that cell takes the digit that
 *   appears three times in its row, column and box.
 */
import { cellAt, CELL_HOUSES, colOf, HOUSE_CELLS, rowOf } from "../geometry";
import type { SolverState } from "../state";
import type { CellId, Digit, Elimination, House, Step } from "../types";
import { addMarks, elimSeeingAll, housePositions, positionsOf, type HousePositions } from "./links";
import type { Technique } from "./types";
import { bit, digitsOf, elimMarks, house, makeStep, marksFor, popcount, sharedHouses } from "./util";

/** [r1, r2, c1, c2] with the four corners in exactly two boxes. */
const RECTANGLES: [number, number, number, number][] = [];
for (let r1 = 0; r1 < 9; r1++)
  for (let r2 = r1 + 1; r2 < 9; r2++)
    for (let c1 = 0; c1 < 9; c1++)
      for (let c2 = c1 + 1; c2 < 9; c2++) {
        const sameBand = Math.floor(r1 / 3) === Math.floor(r2 / 3);
        const sameStack = Math.floor(c1 / 3) === Math.floor(c2 / 3);
        if (sameBand !== sameStack) RECTANGLES.push([r1, r2, c1, c2]);
      }

interface Rect {
  corners: CellId[];
  digits: [Digit, Digit];
  pair: number;
  floor: CellId[];
  roof: CellId[];
}

/** Rectangles whose corners all hold the pair {a,b}, with the corners that hold exactly {a,b} as the floor. */
function* rectangles(s: SolverState): Generator<Rect> {
  for (const [r1, r2, c1, c2] of RECTANGLES) {
    const corners = [cellAt(r1, c1), cellAt(r1, c2), cellAt(r2, c1), cellAt(r2, c2)];
    if (corners.some((c) => s.grid[c])) continue;
    let common = 0x3fe;
    for (const c of corners) common &= s.cand[c]!;
    const ds = digitsOf(common);
    for (let i = 0; i < ds.length; i++)
      for (let j = i + 1; j < ds.length; j++) {
        const pair = bit(ds[i]!) | bit(ds[j]!);
        const floor = corners.filter((c) => s.cand[c] === pair);
        const roof = corners.filter((c) => s.cand[c] !== pair);
        if (floor.length < 2 || !roof.length) continue;
        yield { corners, digits: [ds[i]!, ds[j]!], pair, floor, roof };
      }
  }
}

/** Do two corners lie on the same row or column? */
const sameLine = (a: CellId, b: CellId): boolean => rowOf(a) === rowOf(b) || colOf(a) === colOf(b);

function urStep(
  s: SolverState,
  rect: Rect,
  type: number,
  rating: number,
  elims: Elimination[],
  extra: Record<string, unknown>,
  alt: number,
  houses: House[] = [],
): Step {
  const marks = addMarks(
    [],
    [...elimMarks(elims), ...marksFor(s, rect.roof, alt, "alt"), ...marksFor(s, rect.corners, rect.pair, "key")],
  );
  return makeStep({
    technique: "unique-rectangle",
    tier: 4,
    rating,
    eliminations: elims,
    focus: { cells: rect.corners, cages: [], houses },
    explain: {
      kind: "unique-rectangle",
      type,
      digits: rect.digits,
      corners: rect.corners,
      floor: rect.floor,
      roof: rect.roof,
      roofExtras: rect.roof.map((c) => digitsOf(s.cand[c]! & ~rect.pair)),
      ...extra,
    },
    marks,
  });
}

function type1(s: SolverState): Step | null {
  for (const rect of rectangles(s)) {
    if (rect.floor.length !== 3) continue;
    const roof = rect.roof[0]!;
    const elims = rect.digits.map((digit) => ({ cell: roof, digit }));
    return urStep(s, rect, 1, 4.5, elims, {}, 0);
  }
  return null;
}

function type2(s: SolverState): Step | null {
  for (const rect of rectangles(s)) {
    if (rect.floor.length !== 2 || !sameLine(rect.floor[0]!, rect.floor[1]!)) continue;
    const [r1, r2] = rect.roof as [CellId, CellId];
    if (s.cand[r1] !== s.cand[r2] || popcount(s.cand[r1]!) !== 3) continue;
    const extra = digitsOf(s.cand[r1]! & ~rect.pair)[0]!;
    const elims = elimSeeingAll(s, [r1, r2], extra, rect.corners);
    if (!elims.length) continue;
    return urStep(s, rect, 2, 4.6, elims, { extra }, bit(extra));
  }
  return null;
}

function type4(s: SolverState, pos: HousePositions): Step | null {
  for (const rect of rectangles(s)) {
    if (rect.floor.length !== 2 || !sameLine(rect.floor[0]!, rect.floor[1]!)) continue;
    const roof = rect.roof as [CellId, CellId];
    for (const h of sharedHouses(roof)) {
      for (const [locked, removed] of [rect.digits, [rect.digits[1], rect.digits[0]]] as [Digit, Digit][]) {
        const where = positionsOf(pos[h * 10 + locked]!);
        if (where.length !== 2) continue;
        const elims = roof.filter((c) => s.cand[c]! & bit(removed)).map((cell) => ({ cell, digit: removed }));
        if (!elims.length) continue;
        return urStep(s, rect, 4, 4.6, elims, { house: house(h), locked, removed }, bit(locked), [house(h)]);
      }
    }
  }
  return null;
}

export const uniqueRectangle: Technique = {
  id: "unique-rectangle",
  tier: 4,
  rating: 4.5,
  classicOnly: true,
  assumesUnique: true,
  find(s) {
    return type1(s) ?? type2(s) ?? type4(s, housePositions(s));
  },
};

export const bugPlusOne: Technique = {
  id: "bug-plus-one",
  tier: 4,
  rating: 5.6,
  classicOnly: true,
  assumesUnique: true,
  find(s) {
    let odd = -1;
    for (let c = 0; c < 81; c++) {
      if (s.grid[c]) continue;
      const n = popcount(s.cand[c]!);
      if (n === 2) continue;
      if (n !== 3 || odd >= 0) return null;
      odd = c;
    }
    if (odd < 0) return null;
    const pos = housePositions(s);
    const houses = CELL_HOUSES[odd]!;
    for (const d of digitsOf(s.cand[odd]!)) {
      if (houses.some((h) => popcount(pos[h * 10 + d]!) !== 3)) continue;
      // Without d in the odd cell, every house must hold each digit in exactly 0 or 2 cells.
      let grave = true;
      for (let h = 0; h < 27 && grave; h++) {
        for (let e = 1; e <= 9; e++) {
          const n = popcount(pos[h * 10 + e]!) - (e === d && houses.includes(h) ? 1 : 0);
          if (n !== 0 && n !== 2) {
            grave = false;
            break;
          }
        }
      }
      if (!grave) continue;
      const others = digitsOf(s.cand[odd]! & ~bit(d));
      const seen: CellId[] = [];
      for (const h of houses) for (const i of positionsOf(pos[h * 10 + d]!)) seen.push(HOUSE_CELLS[h]![i]!);
      const triple = [...new Set(seen)].filter((c) => c !== odd).sort((a, b) => a - b);
      return makeStep({
        technique: "bug-plus-one",
        tier: 4,
        rating: 5.6,
        placements: [{ cell: odd, digit: d }],
        focus: { cells: [odd], cages: [], houses: houses.map(house) },
        explain: { kind: "bug-plus-one", cell: odd, digit: d, others, houses: houses.map(house) },
        marks: [{ cell: odd, digit: d, role: "place" }, ...marksFor(s, [odd], bit(others[0]!) | bit(others[1]!), "key"), ...marksFor(s, triple, bit(d), "alt")],
      });
    }
    return null;
  },
};
