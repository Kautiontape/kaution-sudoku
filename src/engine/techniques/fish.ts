/**
 * Fish on one digit: X-wing, swordfish, jellyfish, and the finned/sashimi X-wing and swordfish.
 *
 * Basic fish: n base lines (rows, or columns) whose candidates for d all sit in the same n cover
 * lines. Each base line needs its d in a different cover line, so the cover lines' d's are used up
 * by the base lines: d goes from the rest of the cover lines.
 *
 * Finned fish: the same, except a few base candidates ("fins") sit outside the cover lines, all in
 * one box. Either a fin is d, or the fish is real; so only cover-line cells that also see every fin
 * lose d. Sashimi: some base line has a single candidate left in the cover lines.
 */
import { CELL_HOUSES, colOf, HOUSE_CELLS, rowOf } from "../geometry";
import type { SolverState } from "../state";
import type { CellId, Digit, Elimination, Step } from "../types";
import { cellsAt, housePositions, peersOf, positionsOf, withContext, type HousePositions } from "./links";
import type { Technique } from "./types";
import { bit, COLS, combinations, dedupeElims, elimMarks, house, makeStep, marksFor, popcount, ROWS, sees } from "./util";

/** orientation 0: rows are the base lines (cover = columns); 1: columns are the base lines. */
type Orient = 0 | 1;
const BASES: Record<Orient, readonly number[]> = { 0: ROWS, 1: COLS };
const coverId = (o: Orient, pos: number): number => (o === 0 ? 9 + pos : pos);

/** Base-line cells holding d. */
function baseCells(pos: HousePositions, base: readonly number[], d: Digit, mask = 0x1ff): CellId[] {
  return base.flatMap((h) => cellsAt(h, pos[h * 10 + d]! & mask)).sort((a, b) => a - b);
}

/** Cells of the cover lines that are not in any base line and still hold d. */
function coverElims(s: SolverState, o: Orient, base: readonly number[], cover: number, d: Digit): Elimination[] {
  const out: Elimination[] = [];
  for (const p of positionsOf(cover)) {
    for (const c of HOUSE_CELLS[coverId(o, p)]!) {
      if (s.grid[c] || !(s.cand[c]! & bit(d))) continue;
      if (base.includes(CELL_HOUSES[c]![o]!)) continue;
      out.push({ cell: c, digit: d });
    }
  }
  return dedupeElims(out);
}

/** Cover-line cells outside the base lines that hold d and see every fin (so they see the first fin). */
function finElims(s: SolverState, o: Orient, base: readonly number[], cover: number, d: Digit, fins: readonly CellId[]): Elimination[] {
  const out: Elimination[] = [];
  for (const c of peersOf(s, fins[0]!)) {
    if (s.grid[c] || !(s.cand[c]! & bit(d))) continue;
    if (base.includes(CELL_HOUSES[c]![o]!)) continue;
    if (!(cover & (1 << (o === 0 ? colOf(c) : rowOf(c))))) continue;
    if (fins.some((f) => !sees(s, c, f))) continue;
    out.push({ cell: c, digit: d });
  }
  return out;
}

function fishStep(
  s: SolverState,
  t: { id: string; tier: number; rating: number },
  o: Orient,
  base: readonly number[],
  cover: number,
  d: Digit,
  elims: Elimination[],
  pos: HousePositions,
  fin?: { fins: CellId[]; box: number; sashimi: boolean },
): Step {
  const body = baseCells(pos, base, d, cover);
  const coverHouses = positionsOf(cover).map((p) => house(coverId(o, p)));
  const baseHouses = base.map(house);
  const marks = withContext(s, d, [...marksFor(s, body, bit(d), "key"), ...marksFor(s, fin?.fins ?? [], bit(d), "alt"), ...elimMarks(elims)]);
  const common = {
    size: base.length,
    digit: d,
    baseKind: o === 0 ? "row" : "col",
    base: baseHouses,
    cover: coverHouses,
    cells: body,
  };
  return makeStep({
    technique: t.id,
    tier: t.tier,
    rating: t.rating,
    eliminations: elims,
    focus: {
      cells: [...body, ...(fin?.fins ?? [])].sort((a, b) => a - b),
      cages: [],
      houses: [...baseHouses, ...coverHouses, ...(fin ? [house(18 + fin.box)] : [])],
    },
    explain: fin
      ? { kind: "finned-fish", ...common, fins: fin.fins, finBox: house(18 + fin.box), sashimi: fin.sashimi }
      : { kind: "fish", ...common },
    marks,
  });
}

function basicFish(size: 2 | 3 | 4, id: string, tier: number, rating: number): Technique {
  const t = { id, tier, rating };
  return {
    ...t,
    find(s) {
      const pos = housePositions(s);
      for (let d = 1; d <= 9; d++) {
        for (const o of [0, 1] as const) {
          const lines = BASES[o].filter((h) => {
            const n = popcount(pos[h * 10 + d]!);
            return n >= 2 && n <= size;
          });
          if (lines.length < size) continue;
          for (const base of combinations(lines, size)) {
            let cover = 0;
            for (const h of base) cover |= pos[h * 10 + d]!;
            if (popcount(cover) !== size) continue;
            const elims = coverElims(s, o, base, cover, d);
            if (elims.length) return fishStep(s, t, o, base, cover, d, elims, pos);
          }
        }
      }
      return null;
    },
  };
}

/** Band (rows) or stack (columns) index of a line: which third of the grid it crosses. */
const third = (line: number): number => Math.floor((line % 9) / 3);

function finnedFish(size: 2 | 3, id: string, tier: number, rating: number): Technique {
  const t = { id, tier, rating };
  return {
    ...t,
    find(s) {
      const pos = housePositions(s);
      for (let d = 1; d <= 9; d++) {
        for (const o of [0, 1] as const) {
          // A base line holds at most `size` body candidates plus fins inside one box (≤ 3).
          const lines = BASES[o].filter((h) => {
            const n = popcount(pos[h * 10 + d]!);
            return n >= 2 && n <= size + 3;
          });
          if (lines.length < size) continue;
          for (const base of combinations(lines, size)) {
            let union = 0;
            let thirds = 0;
            for (const h of base) {
              union |= pos[h * 10 + d]!;
              thirds |= 1 << third(h);
            }
            if (popcount(union) <= size) continue; // a basic fish, not a finned one
            for (let box = 0; box < 9; box++) {
              // The fin box: its band (for rows) or stack (for columns) must hold a base line.
              const finThird = o === 0 ? Math.floor(box / 3) : box % 3;
              if (!(thirds & (1 << finThird))) continue;
              // Cover positions outside the box are forced; the rest come from the box's segment.
              const seg = 0b111 << (3 * (o === 0 ? box % 3 : Math.floor(box / 3)));
              const required = union & ~seg;
              const need = size - popcount(required);
              if (need < 0) continue;
              const optional = union & seg;
              let extra = 0;
              do {
                if (popcount(extra) === need) {
                  const step = finnedAt(s, t, o, base, required | extra, d, pos, box, finThird);
                  if (step) return step;
                }
                extra = (extra - optional) & optional;
              } while (extra !== 0);
            }
          }
        }
      }
      return null;
    },
  };
}

/** The finned fish with this cover, if every fin sits in `box` and something can be eliminated. */
function finnedAt(
  s: SolverState,
  t: { id: string; tier: number; rating: number },
  o: Orient,
  base: readonly number[],
  cover: number,
  d: Digit,
  pos: HousePositions,
  box: number,
  finThird: number,
): Step | null {
  let finned = false;
  for (const h of base) {
    const m = pos[h * 10 + d]!;
    if (!(m & cover)) return null; // every base line needs a body candidate
    if (m & ~cover) {
      if (third(h) !== finThird) return null; // a fin outside the box
      finned = true;
    }
  }
  if (!finned) return null;
  const fins = base.flatMap((h) => cellsAt(h, pos[h * 10 + d]! & ~cover)).sort((a, b) => a - b);
  const elims = finElims(s, o, base, cover, d, fins);
  if (!elims.length) return null;
  const sashimi = base.some((h) => popcount(pos[h * 10 + d]! & cover) === 1);
  return fishStep(s, t, o, base, cover, d, elims, pos, { fins, box, sashimi });
}

export const xWing = basicFish(2, "x-wing", 3, 3.2);
export const swordfish = basicFish(3, "swordfish", 3, 3.8);
export const jellyfish = basicFish(4, "jellyfish", 4, 5.2);
export const finnedXWing = finnedFish(2, "finned-x-wing", 3, 3.4);
export const finnedSwordfish = finnedFish(3, "finned-swordfish", 4, 4.0);
