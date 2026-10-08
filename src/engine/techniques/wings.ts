/**
 * Wings: short bent chains through cells with few candidates.
 *
 * - XY-wing: pivot {x,y} sees pincers {x,z} and {y,z}. Whatever the pivot is, one pincer is z, so
 *   cells seeing both pincers lose z.
 * - XYZ-wing: pivot {x,y,z} sees pincers {x,z} and {y,z}. One of the three is z, so cells seeing all
 *   three lose z.
 * - W-wing: two {x,y} cells that don't see each other, joined by a strong link on x (a house where x
 *   has only two places, one seen by each cell). One of the two cells is y.
 *
 * "Sees" includes killer cage-mates (they can't share a digit either).
 */
import type { SolverState } from "../state";
import type { CellId, Digit, Elimination, Step } from "../types";
import { addMarks, conjugatePairs, elimSeeingAll, housePositions } from "./links";
import type { Technique } from "./types";
import { bit, digitsOf, elimMarks, house, makeStep, marksFor, popcount, sees } from "./util";

const bivalueCells = (s: SolverState): CellId[] => {
  const out: CellId[] = [];
  for (let c = 0; c < 81; c++) if (!s.grid[c] && popcount(s.cand[c]!) === 2) out.push(c);
  return out;
};

const only = (mask: number): Digit => digitsOf(mask)[0]!;

function wingStep(
  s: SolverState,
  id: "xy-wing" | "xyz-wing",
  rating: number,
  pivot: CellId,
  a: CellId,
  b: CellId,
  x: Digit,
  y: Digit,
  z: Digit,
  elims: Elimination[],
): Step {
  const keyMask = bit(x) | bit(y);
  const marks = addMarks(
    [],
    [
      ...marksFor(s, [pivot], keyMask, "key"),
      ...marksFor(s, [pivot, a, b], bit(z), "alt"),
      ...marksFor(s, [a, b], keyMask, "key"),
      ...elimMarks(elims),
    ],
  );
  return makeStep({
    technique: id,
    tier: 3,
    rating,
    eliminations: elims,
    focus: { cells: [pivot, a, b], cages: [], houses: [] },
    explain: { kind: id, pivot, pincers: [a, b], x, y, z },
    marks,
  });
}

export const xyWing: Technique = {
  id: "xy-wing",
  tier: 3,
  rating: 4.2,
  find(s) {
    const bivalue = bivalueCells(s);
    for (const pivot of bivalue) {
      const [x, y] = digitsOf(s.cand[pivot]!) as [Digit, Digit];
      const near = bivalue.filter((c) => c !== pivot && sees(s, pivot, c));
      const withX = near.filter((c) => s.cand[c]! & bit(x) && !(s.cand[c]! & bit(y)));
      const withY = near.filter((c) => s.cand[c]! & bit(y) && !(s.cand[c]! & bit(x)));
      for (const a of withX) {
        const zMask = s.cand[a]! & ~bit(x);
        for (const b of withY) {
          if ((s.cand[b]! & ~bit(y)) !== zMask) continue;
          const z = only(zMask);
          const elims = elimSeeingAll(s, [a, b], z, [pivot, a, b]);
          if (elims.length) return wingStep(s, "xy-wing", 4.2, pivot, a, b, x, y, z, elims);
        }
      }
    }
    return null;
  },
};

export const xyzWing: Technique = {
  id: "xyz-wing",
  tier: 3,
  rating: 4.4,
  find(s) {
    const bivalue = bivalueCells(s);
    for (let pivot = 0; pivot < 81; pivot++) {
      if (s.grid[pivot] || popcount(s.cand[pivot]!) !== 3) continue;
      const pm = s.cand[pivot]!;
      const pincers = bivalue.filter((c) => !(s.cand[c]! & ~pm) && sees(s, pivot, c));
      for (let i = 0; i < pincers.length; i++) {
        for (let j = i + 1; j < pincers.length; j++) {
          const a = pincers[i]!;
          const b = pincers[j]!;
          const common = s.cand[a]! & s.cand[b]!;
          if (s.cand[a] === s.cand[b] || popcount(common) !== 1) continue;
          const z = only(common);
          const elims = elimSeeingAll(s, [pivot, a, b], z);
          if (elims.length) return wingStep(s, "xyz-wing", 4.4, pivot, a, b, only(s.cand[a]! & ~common), only(s.cand[b]! & ~common), z, elims);
        }
      }
    }
    return null;
  },
};

export const wWing: Technique = {
  id: "w-wing",
  tier: 4,
  rating: 4.4,
  find(s) {
    const bivalue = bivalueCells(s);
    const pos = housePositions(s);
    for (let i = 0; i < bivalue.length; i++) {
      for (let j = i + 1; j < bivalue.length; j++) {
        const a = bivalue[i]!;
        const b = bivalue[j]!;
        if (s.cand[a] !== s.cand[b] || sees(s, a, b)) continue;
        for (const x of digitsOf(s.cand[a]!)) {
          const y = only(s.cand[a]! & ~bit(x));
          const elims = elimSeeingAll(s, [a, b], y);
          if (!elims.length) continue;
          for (const link of conjugatePairs(s, x, pos)) {
            if ([a, b].includes(link.a) || [a, b].includes(link.b)) continue;
            let pair: [CellId, CellId] | null = null;
            if (sees(s, a, link.a) && sees(s, b, link.b)) pair = [link.a, link.b];
            else if (sees(s, a, link.b) && sees(s, b, link.a)) pair = [link.b, link.a];
            if (!pair) continue;
            const [c, d] = pair;
            const marks = addMarks(
              [],
              [...marksFor(s, [a, b, c, d], bit(x), "key"), ...marksFor(s, [a, b], bit(y), "alt"), ...elimMarks(elims)],
            );
            return makeStep({
              technique: "w-wing",
              tier: 4,
              rating: 4.4,
              eliminations: elims,
              focus: { cells: [a, b, c, d].sort((p, q) => p - q), cages: [], houses: [house(link.house)] },
              explain: { kind: "w-wing", cells: [a, b], x, y, link: [c, d], linkHouse: house(link.house) },
              marks,
              links: [
                { from: { cell: a, digit: x }, to: { cell: c, digit: x }, strong: false },
                { from: { cell: c, digit: x }, to: { cell: d, digit: x }, strong: true },
                { from: { cell: d, digit: x }, to: { cell: b, digit: x }, strong: false },
              ],
            });
          }
        }
      }
    }
    return null;
  },
};
