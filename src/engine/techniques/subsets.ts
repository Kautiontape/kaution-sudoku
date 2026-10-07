/** Naked and hidden subsets (pairs, triples, quads). */
import { ALL_DIGITS, maskOf } from "../combos";
import { HOUSE_CELLS } from "../geometry";
import type { CellId } from "../types";
import type { Technique } from "./types";
import {
  ALL_HOUSE_IDS,
  cellsWith,
  combinations,
  digitsOf,
  elimMarks,
  elimMask,
  emptyIn,
  house,
  makeStep,
  marksFor,
  placedMask,
  popcount,
  sharedHouses,
} from "./util";

const NAMES = { 2: "pair", 3: "triple", 4: "quad" } as const;
const TIER = { 2: 2, 3: 3, 4: 4 } as const;

function nakedSubset(size: 2 | 3 | 4, rating: number): Technique {
  const id = `naked-${NAMES[size]}`;
  return {
    id,
    tier: TIER[size],
    rating,
    find(s) {
      for (const h of ALL_HOUSE_IDS) {
        const empty = emptyIn(s, h);
        if (empty.length <= size) continue;
        const pool = empty.filter((c) => {
          const n = popcount(s.cand[c]!);
          return n >= 2 && n <= size;
        });
        for (const cells of combinations(pool, size)) {
          let union = 0;
          for (const c of cells) union |= s.cand[c]!;
          if (popcount(union) !== size) continue;
          // Every house shared by all the subset's cells loses those digits elsewhere.
          const houses = sharedHouses(cells);
          const elimCells = new Set<CellId>();
          for (const x of houses) for (const c of HOUSE_CELLS[x]!) if (!cells.includes(c)) elimCells.add(c);
          const elims = elimMask(s, elimCells, union);
          if (!elims.length) continue;
          return makeStep({
            technique: id,
            tier: TIER[size],
            rating,
            eliminations: elims,
            focus: { cells, cages: [], houses: houses.map(house) },
            explain: { kind: "naked-subset", size, cells, digits: digitsOf(union), house: house(h), houses: houses.map(house) },
            marks: [...marksFor(s, cells, union, "key"), ...elimMarks(elims)],
          });
        }
      }
      return null;
    },
  };
}

function hiddenSubset(size: 2 | 3 | 4, rating: number): Technique {
  const id = `hidden-${NAMES[size]}`;
  return {
    id,
    tier: TIER[size],
    rating,
    find(s) {
      for (const h of ALL_HOUSE_IDS) {
        const missing = digitsOf(ALL_DIGITS & ~placedMask(s, h));
        if (missing.length <= size) continue;
        const where = new Map(missing.map((d) => [d, cellsWith(s, h, d)]));
        const pool = missing.filter((d) => {
          const n = where.get(d)!.length;
          return n >= 2 && n <= size;
        });
        for (const digits of combinations(pool, size)) {
          const cellSet = new Set<CellId>();
          for (const d of digits) for (const c of where.get(d)!) cellSet.add(c);
          if (cellSet.size !== size) continue;
          const cells = [...cellSet].sort((a, b) => a - b);
          const keep = maskOf(digits);
          const elims = elimMask(s, cells, ALL_DIGITS & ~keep);
          if (!elims.length) continue;
          return makeStep({
            technique: id,
            tier: TIER[size],
            rating,
            eliminations: elims,
            focus: { cells, cages: [], houses: [house(h)] },
            explain: { kind: "hidden-subset", size, cells, digits, house: house(h) },
            marks: [...marksFor(s, cells, keep, "key"), ...elimMarks(elims)],
          });
        }
      }
      return null;
    },
  };
}

export const nakedPair = nakedSubset(2, 3.0);
export const nakedTriple = nakedSubset(3, 3.6);
export const nakedQuad = nakedSubset(4, 5.0);
export const hiddenPair = hiddenSubset(2, 3.4);
export const hiddenTriple = hiddenSubset(3, 4.0);
export const hiddenQuad = hiddenSubset(4, 5.4);
