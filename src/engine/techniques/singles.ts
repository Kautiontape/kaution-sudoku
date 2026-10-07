/** Tier 1: full house, hidden single, naked single. */
import { ALL_DIGITS } from "../combos";
import type { SolverState } from "../state";
import type { CellId, Digit } from "../types";
import type { Technique } from "./types";
import {
  ALL_HOUSE_IDS,
  bit,
  blockersOf,
  BOXES,
  cellsWith,
  COLS,
  digitsOf,
  emptyIn,
  house,
  makeStep,
  placedMask,
  popcount,
  ROWS,
} from "./util";

export const fullHouse: Technique = {
  id: "full-house",
  tier: 1,
  rating: 1.0,
  find(s) {
    for (const h of ALL_HOUSE_IDS) {
      const empty = emptyIn(s, h);
      if (empty.length !== 1) continue;
      const cell = empty[0]!;
      const missing = ALL_DIGITS & ~placedMask(s, h);
      if (popcount(missing) !== 1) continue;
      const digit = digitsOf(missing)[0]!;
      if (!(s.cand[cell]! & bit(digit))) continue;
      return makeStep({
        technique: "full-house",
        tier: 1,
        rating: 1.0,
        placements: [{ cell, digit }],
        focus: { cells: [cell], cages: [], houses: [house(h)] },
        explain: { kind: "full-house", cell, digit, house: house(h) },
        marks: [{ cell, digit, role: "place" }],
      });
    }
    return null;
  },
};

/**
 * For each blocked cell, pick a placed digit that rules it out, preferring sources that block
 * many cells at once (that's how people cross-hatch: a few long sight lines, not one per cell).
 */
function coverBlocked(s: SolverState, cells: readonly CellId[], d: Digit): { cell: CellId; by: CellId | null }[] {
  const options = new Map(cells.map((c) => [c, blockersOf(s, c, d)]));
  const chosen = new Map<CellId, CellId | null>();
  const uncovered = new Set(cells.filter((c) => options.get(c)!.length > 0));
  for (const c of cells) if (!options.get(c)!.length) chosen.set(c, null);
  while (uncovered.size) {
    const tally = new Map<CellId, number>();
    for (const c of uncovered) for (const b of options.get(c)!) tally.set(b, (tally.get(b) ?? 0) + 1);
    let best = -1;
    let bestN = 0;
    for (const [b, n] of tally) if (n > bestN || (n === bestN && b < best)) [best, bestN] = [b, n];
    for (const c of [...uncovered])
      if (options.get(c)!.includes(best)) {
        chosen.set(c, best);
        uncovered.delete(c);
      }
  }
  return cells.map((c) => ({ cell: c, by: chosen.get(c) ?? null }));
}

function uniqueSources(list: { by: CellId | null }[]): CellId[] {
  return [...new Set(list.map((x) => x.by).filter((x): x is CellId => x !== null))].sort((a, b) => a - b);
}

export const hiddenSingle: Technique = {
  id: "hidden-single",
  tier: 1,
  rating: 1.2,
  find(s) {
    for (const h of [...BOXES, ...ROWS, ...COLS]) {
      const missing = ALL_DIGITS & ~placedMask(s, h);
      for (const d of digitsOf(missing)) {
        const cells = cellsWith(s, h, d);
        if (cells.length !== 1) continue;
        const cell = cells[0]!;
        const blocked = coverBlocked(
          s,
          emptyIn(s, h).filter((c) => c !== cell),
          d,
        );
        return makeStep({
          technique: "hidden-single",
          tier: 1,
          rating: h >= 18 ? 1.2 : 1.5,
          placements: [{ cell, digit: d }],
          focus: { cells: [cell], cages: [], houses: [house(h)] },
          explain: { kind: "hidden-single", cell, digit: d, house: house(h), blocked },
          sources: uniqueSources(blocked),
          marks: [{ cell, digit: d, role: "place" }],
        });
      }
    }
    return null;
  },
};

export const nakedSingle: Technique = {
  id: "naked-single",
  tier: 1,
  rating: 2.3,
  find(s) {
    for (let cell = 0; cell < 81; cell++) {
      if (s.grid[cell] || popcount(s.cand[cell]!) !== 1) continue;
      const digit = digitsOf(s.cand[cell]!)[0]!;
      const seen = digitsOf(ALL_DIGITS & ~bit(digit)).map((e) => ({ digit: e, by: blockersOf(s, cell, e)[0] ?? null }));
      return makeStep({
        technique: "naked-single",
        tier: 1,
        rating: 2.3,
        placements: [{ cell, digit }],
        focus: { cells: [cell], cages: [], houses: [] },
        explain: { kind: "naked-single", cell, digit, seen },
        sources: uniqueSources(seen),
        marks: [{ cell, digit, role: "place" }],
      });
    }
    return null;
  },
};
