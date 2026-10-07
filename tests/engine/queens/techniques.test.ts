import { stepChanges } from "../../../src/engine/queens/state";
import {
  assumeQueen,
  confinement,
  contradiction,
  lastCell,
  lineInRegion,
  QUEENS_REGISTRY,
  regionInLine,
  touch,
} from "../../../src/engine/queens/techniques";
import type { QStep } from "../../../src/engine/queens/types";
import { cell, cells, puzzle, state, STRIPES5, UNIQUE5 } from "./fixtures";

const noFocus = { cells: [], rows: [], cols: [], regions: [] };
const at = (name: string) => cell(name, 5);
const at6 = (names: string) => cells(names, 6);

/**
 * UNIQUE5 (regions):      After the free queen on r1c1:
 *   0 1 1 1 2              region 1 is down to r2c3, r3c3 (column 3)
 *   1 1 1 2 2              region 3 is down to r3c2, r4c2, r5c2 (column 2)
 *   3 3 1 2 2
 *   3 3 4 4 2
 *   3 3 4 4 4
 */
const afterR1C1 = () => state(UNIQUE5, "", "r1c1");

/**
 * Six 2×3 block regions; row 2 crossed down to r2c1 and r2c4 (3 apart, so nothing touches both).
 * r1c3 shares region 0 with r2c1 and touches r2c4: a mixed attack, tier 3.
 */
const BLOCKS6 = puzzle(["000111", "000111", "222333", "222333", "444555", "444555"]);
const TOUCH3 = {
  s: state(BLOCKS6, "r2c2 r2c3 r2c5 r2c6"),
  explain: {
    kind: "touch",
    unit: { type: "row", index: 1 },
    unitCells: cells("r2c1 r2c4", 6),
    cells: cells("r1c3", 6),
  },
};

describe("last-cell", () => {
  it("places the queen of a one-cell region", () => {
    expect(lastCell.find(state(UNIQUE5))).toEqual<QStep>({
      technique: "last-cell",
      tier: 1,
      rating: 1,
      placements: [at("r1c1")],
      eliminations: [],
      focus: { ...noFocus, cells: [at("r1c1")], regions: [0] },
      explain: { kind: "last-cell", unit: { type: "region", index: 0 }, cell: at("r1c1") },
    });
  });

  it("finds a row when no region qualifies", () => {
    const step = lastCell.find(state(UNIQUE5, "r2c4 r2c5", "r1c1"))!;
    expect(step.placements).toEqual([at("r2c3")]);
    expect(step.explain).toEqual({ kind: "last-cell", unit: { type: "row", index: 1 }, cell: at("r2c3") });
    expect(step.focus).toEqual({ ...noFocus, cells: [at("r2c3")], rows: [1] });
  });

  it("prefers regions, then rows, then columns", () => {
    // Every row of STRIPES5 is also a region: the region is reported.
    expect(lastCell.find(state(STRIPES5, "r1c2 r1c3 r1c4 r1c5"))!.explain).toEqual({
      kind: "last-cell",
      unit: { type: "region", index: 0 },
      cell: at("r1c1"),
    });
    // Row 5 is down to r5c5 and column 4 to r4c4, no region to one cell: the row wins.
    expect(lastCell.find(state(UNIQUE5, "r5c2 r5c3 r5c4 r2c4 r3c4", "r1c1"))!.explain).toEqual({
      kind: "last-cell",
      unit: { type: "row", index: 4 },
      cell: at("r5c5"),
    });
    // Only column 4 is down to one cell.
    expect(lastCell.find(state(UNIQUE5, "r2c4 r3c4 r5c4", "r1c1"))!.explain).toEqual({
      kind: "last-cell",
      unit: { type: "col", index: 3 },
      cell: at("r4c4"),
    });
  });

  it("returns null when every open unit has two or more cells", () => {
    expect(lastCell.find(afterR1C1())).toBe(null);
  });
});

describe("region-in-line", () => {
  it("clears the rest of the column a region is stuck in", () => {
    expect(regionInLine.find(afterR1C1())).toEqual<QStep>({
      technique: "region-in-line",
      tier: 2,
      rating: 2,
      placements: [],
      eliminations: [at("r4c3"), at("r5c3")],
      focus: { ...noFocus, cells: [at("r2c3"), at("r3c3")], cols: [2], regions: [1] },
      explain: {
        kind: "region-in-line",
        region: 1,
        line: { type: "col", index: 2 },
        cells: [at("r2c3"), at("r3c3")],
      },
    });
  });

  it("skips regions whose line has nothing left to clear", () => {
    // Region 1 is in column 3 and region 3 in column 2, but those columns are already clear.
    expect(regionInLine.find(state(UNIQUE5, "r4c3 r5c3", "r1c1"))).toBe(null);
    expect(regionInLine.find(afterR1C1(), 1)).toBe(null); // above maxTier
  });
});

describe("line-in-region", () => {
  it("clears a region outside the row whose cells it owns", () => {
    // Row 5 is down to r5c3, r5c4, r5c5, all region 4: region 4's queen is in row 5.
    expect(lineInRegion.find(state(UNIQUE5, "r5c1 r5c2"))).toEqual<QStep>({
      technique: "line-in-region",
      tier: 2,
      rating: 2.2,
      placements: [],
      eliminations: [at("r4c3"), at("r4c4")],
      focus: { ...noFocus, cells: [at("r5c3"), at("r5c4"), at("r5c5")], rows: [4], regions: [4] },
      explain: {
        kind: "line-in-region",
        line: { type: "row", index: 4 },
        region: 4,
        cells: [at("r5c3"), at("r5c4"), at("r5c5")],
      },
    });
  });
});

describe("touch", () => {
  it("removes every cell that touches both cells of a two-cell region (tier 2)", () => {
    expect(touch.find(afterR1C1())).toEqual<QStep>({
      technique: "touch",
      tier: 2,
      rating: 2.5,
      placements: [],
      eliminations: [at("r2c4"), at("r3c2"), at("r3c4")],
      focus: { ...noFocus, cells: [at("r2c3"), at("r2c4"), at("r3c2"), at("r3c3"), at("r3c4")], regions: [1] },
      explain: {
        kind: "touch",
        unit: { type: "region", index: 1 },
        unitCells: [at("r2c3"), at("r3c3")],
        cells: [at("r2c4"), at("r3c2"), at("r3c4")],
      },
    });
  });

  it("handles the classic 3-in-a-row region", () => {
    // Region 3 is r3c4, r3c5, r3c6. r2c5 and r4c5 touch all three.
    const p = puzzle(["000111", "000111", "222333", "222444", "555444", "555444"]);
    const step = touch.find(state(p))!;
    expect(step.tier).toBe(2);
    expect(step.explain).toEqual({
      kind: "touch",
      unit: { type: "region", index: 3 },
      unitCells: at6("r3c4 r3c5 r3c6"),
      cells: at6("r2c5 r4c5"),
    });
  });

  it("falls back to mixed line-and-touch attacks at tier 3", () => {
    expect(touch.find(TOUCH3.s, 2)).toBe(null);
    const step = touch.find(TOUCH3.s)!;
    expect(step.tier).toBe(3);
    expect(step.rating).toBe(3);
    expect(step.explain).toEqual(TOUCH3.explain);
    expect(step.eliminations).toEqual(TOUCH3.explain.cells);
  });
});

describe("confinement", () => {
  it("two regions inside two rows own those rows (tier 3)", () => {
    const p = puzzle(["002211", "002211", "322224", "332244", "355554", "355554"]);
    expect(confinement.find(state(p))).toEqual<QStep>({
      technique: "confinement",
      tier: 3,
      rating: 3.5,
      placements: [],
      eliminations: at6("r1c3 r1c4 r2c3 r2c4"),
      focus: {
        cells: at6("r1c1 r1c2 r1c5 r1c6 r2c1 r2c2 r2c5 r2c6"),
        rows: [0, 1],
        cols: [],
        regions: [0, 1],
      },
      explain: {
        kind: "confinement",
        form: "regions-in-lines",
        lineType: "row",
        k: 2,
        regions: [0, 1],
        lines: [0, 1],
        cells: at6("r1c1 r1c2 r1c5 r1c6 r2c1 r2c2 r2c5 r2c6"),
      },
    });
  });

  it("two rows inside two regions use those regions up (dual form)", () => {
    const p = puzzle(["000111", "022221", "032241", "335544", "355554", "335544"]);
    const step = confinement.find(state(p, "r2c2 r2c3 r2c4 r2c5"))!;
    expect(step.eliminations).toEqual(at6("r3c1 r3c6"));
    expect(step.explain).toEqual({
      kind: "confinement",
      form: "lines-in-regions",
      lineType: "row",
      k: 2,
      regions: [0, 1],
      lines: [0, 1],
      cells: at6("r1c1 r1c2 r1c3 r1c4 r1c5 r1c6 r2c1 r2c6"),
    });
    expect(step.focus).toMatchObject({ rows: [0, 1], regions: [0, 1] });
  });

  it("three regions inside three rows (tier 4), with no smaller pattern", () => {
    const p = puzzle(["000224", "011224", "331224", "333334", "355544", "355544"]);
    const s = state(p, "r2c4 r2c5");
    expect(confinement.find(s, 3)).toBe(null);
    const step = confinement.find(s)!;
    expect(step.tier).toBe(4);
    expect(step.rating).toBe(4);
    expect(step.eliminations).toEqual(at6("r1c6 r2c6 r3c1 r3c2 r3c6"));
    expect(step.explain).toEqual({
      kind: "confinement",
      form: "regions-in-lines",
      lineType: "row",
      k: 3,
      regions: [0, 1, 2],
      lines: [0, 1, 2],
      cells: at6("r1c1 r1c2 r1c3 r1c4 r1c5 r2c1 r2c2 r2c3 r3c3 r3c4 r3c5"),
    });
  });
});

describe("contradiction", () => {
  it("follows forced placements until a unit is empty, keeping only the links that matter", () => {
    // After r1c1: a queen on r3c3 leaves region 3 only r5c2; that queen then wipes out region 4.
    expect(assumeQueen(afterR1C1(), at("r3c3"))).toEqual({
      chain: [{ cell: at("r5c2"), unit: { type: "region", index: 3 } }],
      empty: { type: "region", index: 4 },
    });
    // r2c3 is the real queen: no contradiction.
    expect(assumeQueen(afterR1C1(), at("r2c3"))).toBe(null);
  });

  it("reports the shortest chain it can find", () => {
    // r2c4 touches both remaining cells of region 1 directly: a chain of length 0.
    const step = contradiction.find(afterR1C1())!;
    expect(step.technique).toBe("contradiction");
    expect(step.tier).toBe(5);
    expect(step.eliminations).toEqual([at("r2c4")]);
    expect(step.explain).toEqual({
      kind: "contradiction",
      cell: at("r2c4"),
      chain: [],
      empty: { type: "region", index: 1 },
    });
    expect(contradiction.find(afterR1C1(), 4)).toBe(null);
  });
});

describe("registry", () => {
  it("is ordered by tier and every step it returns changes the state", () => {
    const tiers = QUEENS_REGISTRY.map((t) => t.tier);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
    expect(QUEENS_REGISTRY.map((t) => t.id)).toEqual([
      "last-cell",
      "region-in-line",
      "line-in-region",
      "touch",
      "confinement",
      "contradiction",
    ]);
    const s = afterR1C1();
    for (const t of QUEENS_REGISTRY) {
      const step = t.find(s);
      if (step) expect(stepChanges(s, step)).toBe(true);
    }
  });
});
