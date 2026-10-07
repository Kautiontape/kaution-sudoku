/**
 * The 45 rule (innies & outies), via region.ts.
 *
 * For a region (1–4 whole rows/columns/boxes), the innies sum to 45n − Σ(cages inside) and the
 * outies to Σ(cages sticking out) − Σ(innies). Subtract digits already placed among them:
 * - one empty cell left → place it;
 * - 2–4 empty cells → treat them as a virtual cage with that sum and drop impossible candidates
 *   (cells that don't see each other may repeat a digit).
 */
import { sumSupport } from "../candidates";
import { analyzeRegionCached, MULTI_REGIONS, SINGLE_REGIONS, type RegionAnalysis } from "../region";
import type { SolverState } from "../state";
import type { CellId, Elimination, House, Step } from "../types";
import type { Technique } from "./types";
import { bit, digitsOf, elimMarks, makeStep, marksFor, sees } from "./util";

type Side = "innies" | "outies";

function regionStep(s: SolverState, ra: RegionAnalysis, side: Side, multi: boolean): Step | null {
  const cells = side === "innies" ? ra.innies : ra.outies;
  if (!cells.length) return null;
  const sum = side === "innies" ? ra.innieSum : ra.outieSum;
  const empty: CellId[] = [];
  const placed: { cell: CellId; digit: number }[] = [];
  for (const c of cells) {
    if (s.grid[c]) placed.push({ cell: c, digit: s.grid[c]! });
    else empty.push(c);
  }
  if (!empty.length || empty.length > 4) return null;
  const target = sum - placed.reduce((a, p) => a + p.digit, 0);
  const focus = {
    cells: [...cells],
    cages: [...ra.inside.map((c) => c.id), ...ra.partial.map((p) => p.cage.id)],
    houses: ra.houses,
  };
  const explain = {
    kind: "innies-outies",
    side,
    houses: ra.houses,
    total: ra.total,
    inside: ra.inside.map((c) => ({ id: c.id, sum: c.sum })),
    insideSum: ra.insideSum,
    partial: ra.partial.map((p) => ({ id: p.cage.id, sum: p.cage.sum, inCells: p.inCells, outCells: p.outCells })),
    cells,
    sum,
    placed,
    empty,
    target,
  };
  const sources = placed.map((p) => p.cell);

  if (empty.length === 1) {
    const cell = empty[0]!;
    if (target < 1 || target > 9 || !(s.cand[cell]! & bit(target))) return null;
    return makeStep({
      technique: "innies-outies",
      tier: 3,
      rating: multi ? 3.4 : 3.0,
      placements: [{ cell, digit: target }],
      focus,
      explain: { ...explain, result: "place" },
      sources,
      marks: [{ cell, digit: target, role: "place" }],
    });
  }

  const support = sumSupport(
    empty.map((c) => s.cand[c]!),
    target,
    (i, j) => sees(s, empty[i]!, empty[j]!),
  );
  if (!support) return null;
  const elims: Elimination[] = [];
  empty.forEach((c, i) => {
    for (const d of digitsOf(s.cand[c]! & ~support[i]!)) elims.push({ cell: c, digit: d });
  });
  if (!elims.length) return null;
  const allowed = support.reduce((a, m) => a | m, 0);
  return makeStep({
    technique: "innies-outies",
    tier: 3,
    rating: multi ? 3.6 : 3.2,
    eliminations: elims,
    focus,
    explain: { ...explain, result: "eliminate", support },
    sources,
    marks: [...marksFor(s, empty, allowed, "key"), ...elimMarks(elims)],
    virtualCages: [{ id: -1, sum: target, cells: empty, virtual: true }],
  });
}

function scan(regions: House[][], multi: boolean): (s: SolverState) => Step | null {
  return (s) => {
    let best: Step | null = null;
    for (const houses of regions) {
      const ra = analyzeRegionCached(s.cages, houses);
      for (const side of ["innies", "outies"] as const) {
        const step = regionStep(s, ra, side, multi);
        if (!step) continue;
        // Placements beat eliminations; among those, fewer leftover cells read more easily.
        if (step.placements.length) return step;
        best ??= step;
      }
    }
    return best;
  };
}

export const inniesSingle: Technique = {
  id: "innies-outies",
  tier: 3,
  rating: 3.0,
  killerOnly: true,
  find: scan(SINGLE_REGIONS, false),
};

export const inniesMulti: Technique = {
  id: "innies-outies",
  tier: 3,
  rating: 3.4,
  killerOnly: true,
  find: scan(MULTI_REGIONS, true),
};
