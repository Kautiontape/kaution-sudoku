import { queensHint, stepText, type RegionNamer } from "../../../src/engine/queens/hints";
import { assumeQueen, confinement, lineInRegion, regionInLine, touch } from "../../../src/engine/queens/techniques";
import { QUEEN, type QStep } from "../../../src/engine/queens/types";
import { cell, cells, marks, puzzle, solutionCells, state, STRIPES5, UNIQUE5 } from "./fixtures";

/** UNIQUE5 regions 0..4 shown as red, orange, yellow, green, blue. */
const COLOURS: RegionNamer = { region: (i) => ["red", "orange", "yellow", "green", "blue"][i] ?? "grey" };
const at = (name: string) => cell(name, 5);

describe("queensHint: rung 0 and end states", () => {
  it("solved", () => {
    const m = marks(UNIQUE5, "r1c2");
    for (const c of solutionCells(UNIQUE5)) m[c] = QUEEN;
    const h = queensHint(UNIQUE5, m);
    expect(h.kind).toBe("solved");
    expect(h.title).toBe("Solved");
    expect(h.ladder.what).toBe("The puzzle is solved.");
  });

  it("mistake: a queen touching another queen", () => {
    const h = queensHint(UNIQUE5, marks(UNIQUE5, "", "r1c1 r2c2"));
    expect(h).toEqual({
      kind: "mistake",
      title: "Check your queens",
      ladder: {
        where: "Look at row 2.",
        what: "A queen is in the wrong place.",
        why: ["The queen on r2c2 touches the queen on r1c1.", "Queens can't touch, not even diagonally."],
        do: "Remove it.",
      },
      wrongCells: [at("r2c2")],
    });
  });

  it("mistake: two queens in a row, or in a region", () => {
    expect(queensHint(UNIQUE5, marks(UNIQUE5, "", "r1c1 r1c3")).ladder.why).toEqual([
      "The queens on r1c3 and r1c1 are both in row 1.",
      "Each row gets exactly one queen.",
    ]);
    expect(queensHint(UNIQUE5, marks(UNIQUE5, "", "r2c3 r1c2"), COLOURS).ladder.why).toEqual([
      "The queens on r1c2 and r2c3 are both in the orange region.",
      "Each region gets exactly one queen.",
    ]);
  });

  it("mistake: no rule broken yet, but a unit is left empty", () => {
    // A lone queen on r2c2 rules out r1c1, the whole of region 1 (red).
    expect(queensHint(UNIQUE5, marks(UNIQUE5, "", "r2c2"), COLOURS).ladder).toEqual({
      where: "Look at row 2.",
      what: "A queen is in the wrong place.",
      why: [
        "With a queen on r2c2, the red region has no cell left for its queen.",
        "Every region needs one, so this queen can't stay.",
      ],
      do: "Remove it.",
    });
  });

  it("mistake: nothing visible yet, and several misplaced queens", () => {
    expect(queensHint(UNIQUE5, marks(UNIQUE5, "", "r3c3")).ladder.why).toEqual([
      "The queen on r3c3 doesn't break a rule yet, but the rest of the puzzle can't be completed around it.",
    ]);
    const h = queensHint(UNIQUE5, marks(UNIQUE5, "r1c1", "r3c3 r5c1"));
    expect(h.kind).toBe("mistake"); // mistakes come before notes
    expect(h.wrongCells).toEqual([at("r3c3"), at("r5c1")]);
    expect(h.ladder).toEqual({
      where: "Look at rows 3 and 5.",
      what: "2 queens are in the wrong place.",
      why: [
        "The queen on r3c3 doesn't break a rule yet, but the rest of the puzzle can't be completed around it.",
        "The queen on r5c1 is in the wrong place too.",
      ],
      do: "Remove them.",
    });
  });

  it("notes: an X on a cell that needs a queen", () => {
    expect(queensHint(UNIQUE5, marks(UNIQUE5, "r1c1 r2c2"))).toEqual({
      kind: "notes",
      title: "Check your X's",
      ladder: {
        where: "Look at row 1.",
        what: "One of your X's is on a cell that needs a queen.",
        why: [
          'An X means "no queen here", but the solution has a queen on r1c1.',
          "A wrong X can leave a row, column or region with nowhere to go, and then nothing adds up.",
        ],
        do: "Remove the X from r1c1.",
      },
      wrongCells: [at("r1c1")],
    });
    const two = queensHint(UNIQUE5, marks(UNIQUE5, "r1c1 r3c5"));
    expect(two.ladder.where).toBe("Look at rows 1 and 3.");
    expect(two.ladder.what).toBe("Two of your X's are on cells that need a queen.");
    expect(two.ladder.do).toBe("Remove the X's from r1c1 and r3c5.");
  });

  it("stuck when no technique applies", () => {
    const h = queensHint(STRIPES5, marks(STRIPES5));
    expect(h.kind).toBe("stuck");
    expect(h.step).toBeUndefined();
  });
});

describe("queensHint: step ladders", () => {
  it("last cell of a one-cell region (default region names)", () => {
    const h = queensHint(UNIQUE5, marks(UNIQUE5));
    expect(h.kind).toBe("step");
    expect(h.title).toBe("Last Cell");
    expect(h.technique).toBe("last-cell");
    expect(h.tier).toBe(1);
    expect(h.step!.placements).toEqual([at("r1c1")]);
    expect(h.ladder).toEqual({
      where: "Look at region 1.",
      what: "Last Cell: region 1 has only one place left for its queen.",
      why: ["Region 1 is a single cell, r1c1.", "Every region needs exactly one queen, so its queen has to go on r1c1."],
      do: "Place a queen on r1c1.",
    });
  });

  it("last cell of a row", () => {
    expect(queensHint(UNIQUE5, marks(UNIQUE5, "r2c4 r2c5", "r1c1")).ladder).toEqual({
      where: "Look at row 2.",
      what: "Last Cell: row 2 has only one place left for its queen.",
      why: [
        "Every row needs exactly one queen.",
        "All the other cells of row 2 are ruled out: each one is crossed out, touches a queen, or shares a row, column or region with a queen.",
        "That leaves r2c3 as the only place for row 2's queen.",
      ],
      do: "Place a queen on r2c3.",
    });
  });

  it("region in a line (colour names)", () => {
    const h = queensHint(UNIQUE5, marks(UNIQUE5, "", "r1c1"), COLOURS);
    expect(h.title).toBe("Region in a Line");
    expect(h.ladder).toEqual({
      where: "Look at the orange region.",
      what: "Region in a Line: all of the orange region's open cells are in one column.",
      why: [
        "The orange region's remaining cells (r2c3 and r3c3) are all in column 3.",
        "Its queen has to be one of them, so column 3's queen will come from the orange region.",
        "Column 3 can only have one queen, so no other cell in column 3 can hold a queen.",
      ],
      do: "Cross out r4c3 and r5c3.",
    });
  });

  it("line in a region", () => {
    const step = lineInRegion.find(state(UNIQUE5, "r5c1 r5c2"))!;
    expect(stepText(step, UNIQUE5)).toEqual({
      where: "Look at row 5.",
      what: "Line in a Region: every open cell of row 5 is in the same region.",
      why: [
        "Row 5's remaining cells (r5c3, r5c4 and r5c5) are all in region 5.",
        "Row 5 needs a queen, so region 5's one queen must be in row 5.",
        "That rules out the rest of region 5.",
      ],
      do: "Cross out r4c3 and r4c4.",
    });
  });

  it("touch: a cell touching a whole 1×3 region", () => {
    const p = puzzle(["000111", "000111", "222333", "222444", "555444", "555444"]);
    const names: RegionNamer = { region: (i) => ["red", "yellow", "green", "orange", "blue", "pink"][i]! };
    const step = touch.find(state(p, "r2c5"))!;
    expect(stepText(step, p, names)).toEqual({
      where: "Look at the orange region.",
      what: "Touch: a queen in the wrong spot would leave the orange region with no room at all.",
      why: [
        "A queen on r4c5 would touch every remaining cell of the orange region (r3c4, r3c5 and r3c6), leaving that region nowhere to go.",
        "So r4c5 can't hold a queen.",
      ],
      do: "Cross out r4c5.",
    });
  });

  it("touch: several cells at once", () => {
    const step = touch.find(state(UNIQUE5, "", "r1c1"))!;
    expect(stepText(step, UNIQUE5, COLOURS).why).toEqual([
      "A queen on r2c4 would touch every remaining cell of the orange region (r2c3 and r3c3), leaving that region nowhere to go.",
      "A queen on r3c2 or r3c4 would do the same.",
      "So r2c4, r3c2 and r3c4 can't hold a queen.",
    ]);
  });

  it("touch: touching one cell and sharing a region with the other", () => {
    const p = puzzle(["000111", "000111", "222333", "222333", "444555", "444555"]);
    const step = touch.find(state(p, "r2c2 r2c3 r2c5 r2c6"))!;
    expect(stepText(step, p)).toEqual({
      where: "Look at row 2.",
      what: "Touch: a queen in the wrong spot would leave row 2 with no room at all.",
      why: [
        "A queen on r1c3 would touch r2c4 and share region 1 with r2c1: that is every remaining cell of row 2, leaving that row nowhere to go.",
        "So r1c3 can't hold a queen.",
      ],
      do: "Cross out r1c3.",
    });
  });

  it("confinement: two regions in two rows", () => {
    const p = puzzle(["002211", "002211", "322224", "332244", "355554", "355554"]);
    const step = confinement.find(state(p))!;
    expect(stepText(step, p)).toEqual({
      where: "Look at regions 1 and 2.",
      what: "Confinement: two regions fit inside the same two rows.",
      why: [
        "Regions 1 and 2 can only put their queens in rows 1 and 2.",
        "That's two queens that must land in two rows, and two rows hold exactly two queens. So these regions take up rows 1 and 2 completely.",
        "No other region can have its queen in rows 1 or 2.",
      ],
      do: "Cross out r1c3, r1c4, r2c3 and r2c4.",
    });
    const names: RegionNamer = { region: (i) => ["purple", "green"][i] ?? "grey" };
    expect(stepText(step, p, names).where).toBe("Look at the purple and green regions.");
  });

  it("confinement: two rows in two regions", () => {
    const p = puzzle(["000111", "022221", "032241", "335544", "355554", "335544"]);
    const step = confinement.find(state(p, "r2c2 r2c3 r2c4 r2c5"))!;
    expect(stepText(step, p)).toEqual({
      where: "Look at rows 1 and 2.",
      what: "Confinement: two rows can only take queens from the same two regions.",
      why: [
        "Rows 1 and 2 can only get their queens from regions 1 and 2.",
        "Those two rows need two queens, and two regions have exactly two queens between them. So both of those regions' queens are used up in rows 1 and 2.",
        "Regions 1 and 2 can't have a queen anywhere else.",
      ],
      do: "Cross out r3c1 and r3c6.",
    });
  });

  it("contradiction narrates the forced chain", () => {
    const s = state(UNIQUE5, "", "r1c1");
    const h = assumeQueen(s, at("r3c3"))!;
    const step: QStep = {
      technique: "contradiction",
      tier: 5,
      rating: 5.1,
      placements: [],
      eliminations: [at("r3c3")],
      focus: { cells: [at("r3c3"), at("r5c2")], rows: [], cols: [], regions: [3, 4] },
      explain: { kind: "contradiction", cell: at("r3c3"), chain: h.chain, empty: h.empty },
    };
    expect(stepText(step, UNIQUE5, COLOURS)).toEqual({
      where: "Look at r3c3.",
      what: "Contradiction: imagine a queen on r3c3 and follow what it forces.",
      why: [
        "Suppose r3c3 held a queen.",
        "Then the green region would have only r5c2 left, so its queen would have to go there.",
        "But then the blue region would have no cell left for its queen.",
        "The blue region must have a queen, so the assumption was wrong: r3c3 can't hold a queen.",
      ],
      do: "Cross out r3c3.",
    });
  });

  it("region in a line on columns uses the column wording", () => {
    const step = regionInLine.find(state(UNIQUE5, "", "r1c1"))!;
    expect(stepText(step, UNIQUE5).where).toBe("Look at region 2.");
  });

  it("every rung is non-empty text with 1-indexed cell names", () => {
    const h = queensHint(UNIQUE5, marks(UNIQUE5, "", "r1c1"));
    for (const s of [h.ladder.where, h.ladder.what, h.ladder.do, ...h.ladder.why]) {
      expect(s.length).toBeGreaterThan(0);
      expect(s).not.toMatch(/r0|c0\b|undefined|NaN/);
    }
    expect(cells("r2c3 r3c3", 5)).toEqual(h.step!.focus.cells);
  });
});
