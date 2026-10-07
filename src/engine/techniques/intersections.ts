/** Tier 2: locked candidates — pointing (box → line) and claiming (line → box). */
import { ALL_DIGITS } from "../combos";
import { HOUSE_CELLS } from "../geometry";
import type { Technique } from "./types";
import {
  BOXES,
  cellsWith,
  digitContext,
  digitsOf,
  elimDigit,
  elimMarks,
  house,
  LINES,
  makeStep,
  marksFor,
  placedMask,
  sharedHouses,
  bit,
} from "./util";

export const pointing: Technique = {
  id: "pointing",
  tier: 2,
  rating: 2.6,
  find(s) {
    for (const b of BOXES) {
      for (const d of digitsOf(ALL_DIGITS & ~placedMask(s, b))) {
        const cells = cellsWith(s, b, d);
        if (cells.length < 2) continue;
        for (const line of sharedHouses(cells)) {
          if (line === b) continue;
          const elims = elimDigit(
            s,
            HOUSE_CELLS[line]!.filter((c) => !cells.includes(c)),
            d,
          );
          if (!elims.length) continue;
          const marks = [...marksFor(s, cells, bit(d), "key"), ...elimMarks(elims)];
          return makeStep({
            technique: "pointing",
            tier: 2,
            rating: 2.6,
            eliminations: elims,
            focus: { cells, cages: [], houses: [house(b), house(line)] },
            explain: { kind: "pointing", digit: d, box: house(b), line: house(line), cells },
            marks: [...marks, ...digitContext(s, d, marks)],
          });
        }
      }
    }
    return null;
  },
};

export const claiming: Technique = {
  id: "claiming",
  tier: 2,
  rating: 2.8,
  find(s) {
    for (const line of LINES) {
      for (const d of digitsOf(ALL_DIGITS & ~placedMask(s, line))) {
        const cells = cellsWith(s, line, d);
        if (cells.length < 2) continue;
        const box = sharedHouses(cells).find((h) => h >= 18);
        if (box === undefined) continue;
        const elims = elimDigit(
          s,
          HOUSE_CELLS[box]!.filter((c) => !cells.includes(c)),
          d,
        );
        if (!elims.length) continue;
        const marks = [...marksFor(s, cells, bit(d), "key"), ...elimMarks(elims)];
        return makeStep({
          technique: "claiming",
          tier: 2,
          rating: 2.8,
          eliminations: elims,
          focus: { cells, cages: [], houses: [house(line), house(box)] },
          explain: { kind: "claiming", digit: d, line: house(line), box: house(box), cells },
          marks: [...marks, ...digitContext(s, d, marks)],
        });
      }
    }
    return null;
  },
};
