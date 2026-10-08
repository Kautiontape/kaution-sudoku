import { ADVANCED_CATALOG } from "../../src/engine/catalog-advanced";
import { templateFor, TEMPLATES } from "../../src/engine/hints/registry";
import { ADVANCED_TEMPLATES } from "../../src/engine/hints/templates-advanced";
import type { SolverState } from "../../src/engine/state";
import { ADVANCED_TECHNIQUES, aic, bugPlusOne, emptyRectangle, finnedXWing, jellyfish, simpleColoring, skyscraper, swordfish, twoStringKite, uniqueRectangle, wWing, xChain, xWing, xyChain, xyWing, xyzWing } from "../../src/engine/techniques/advanced";
import type { Technique } from "../../src/engine/techniques/types";
import type { Puzzle, Step } from "../../src/engine/types";
import { boxOnly, colOnly, rowOnly } from "./advanced-helpers";
import { cage, cell, classic, stateWith, withDigits } from "./helpers";

const PLAIN = withDigits({});
const open = () => stateWith(PLAIN);

function ladder(t: Technique, s: SolverState, puzzle: Puzzle = PLAIN) {
  const step = t.find(s);
  expect(step).not.toBeNull();
  return { step: step!, text: templateFor(step!.technique)(step!, { puzzle }) };
}

/** Words that would give the technique away on the "where" rung. */
const NAMES = /wing|fish|chain|kite|skyscraper|rectangle|colou?r|unique|bug|grave/i;

function checkLadder(step: Step, text: { where: string; what: string; why: string[]; do: string }) {
  const all = [text.where, text.what, ...text.why, text.do];
  for (const line of all) {
    expect(line.length).toBeGreaterThan(5);
    expect(line).not.toMatch(/undefined|NaN|null|\[object/);
  }
  expect(text.where).not.toMatch(NAMES);
  // Every eliminated cell is named somewhere in the explanation or the action.
  for (const e of step.eliminations) expect(all.join(" ")).toContain(`r${Math.floor(e.cell / 9) + 1}c${(e.cell % 9) + 1}`);
}

describe("advanced registry, templates and catalog agree", () => {
  const ids = [...new Set(ADVANCED_TECHNIQUES.map((t) => t.id))];

  it("every advanced technique has its own template and a catalog entry", () => {
    for (const id of ids) {
      expect(ADVANCED_TEMPLATES[id], id).toBeDefined();
      expect(TEMPLATES[id]).toBe(ADVANCED_TEMPLATES[id]);
      const info = ADVANCED_CATALOG.find((c) => c.id === id);
      expect(info, id).toBeDefined();
      const t = ADVANCED_TECHNIQUES.find((x) => x.id === id)!;
      expect(info!.tier).toBe(t.tier);
      expect(info!.rating).toBe(t.rating);
      expect(info!.family).toBe("sudoku");
      expect(info!.name.length).toBeGreaterThan(3);
      for (const field of [info!.summary, info!.spot, info!.why]) expect(field.length).toBeGreaterThan(30);
    }
    expect(ADVANCED_CATALOG.map((c) => c.id).sort()).toEqual([...ids].sort());
  });

  it("keeps the agreed difficulty order", () => {
    const rating = (id: string) => ADVANCED_TECHNIQUES.find((t) => t.id === id)!.rating;
    const order = [
      // Skyscraper and 2-String Kite are taught before the finned X-Wing that also covers them.
      ["x-wing", "skyscraper", "two-string-kite", "finned-x-wing", "swordfish", "finned-swordfish", "xy-wing", "xyz-wing", "empty-rectangle", "jellyfish", "bug-plus-one", "x-chain", "xy-chain", "aic"],
      ["skyscraper", "two-string-kite", "empty-rectangle"],
      ["w-wing", "simple-coloring"],
    ];
    for (const chain of order) for (let i = 1; i < chain.length; i++) expect(rating(chain[i]!)).toBeGreaterThan(rating(chain[i - 1]!));
    expect(uniqueRectangle.assumesUnique && uniqueRectangle.classicOnly && bugPlusOne.assumesUnique && bugPlusOne.classicOnly).toBe(true);
  });
});

describe("advanced hint text", () => {
  it("xy-wing walks through both cases with concrete cells", () => {
    const { step, text } = ladder(xyWing, stateWith(PLAIN, { r2c2: "37", r2c8: "35", r6c2: "57" }));
    checkLadder(step, text);
    expect(text.where).toBe("Look at r2c2 and the two-candidate cells it sees.");
    expect(text.why).toEqual([
      "r2c2 is either 3 or 7.",
      "If it's 3, r2c8 can't also be 3 (same row), so r2c8 must be 5.",
      "If it's 7, r6c2 can't also be 7 (same column), so r6c2 must be 5.",
      "Either way, one of r2c8 and r6c2 is 5. r6c8 sees both of them, so it can't be 5.",
    ]);
    expect(text.do).toBe("Remove 5 from r6c8.");
  });

  it("killer: a cage-mate counts as a cell the pivot sees", () => {
    const p = withDigits({}, [cage(0, 4, ["r1c1", "r2c4"])]);
    const { step, text } = ladder(xyWing, stateWith(p, { r1c1: "12", r2c4: "13", r5c1: "23" }), p);
    checkLadder(step, text);
    expect(text.why[1]).toBe("If it's 1, r2c4 can't also be 1 (same cage), so r2c4 must be 3.");
  });

  it("x-wing names both rows and the columns they lock", () => {
    const s = open();
    rowOnly(s, 5, 2, [3, 8]);
    rowOnly(s, 5, 7, [3, 8]);
    const { step, text } = ladder(xWing, s);
    checkLadder(step, text);
    expect(text.where).toBe("Look at the 5s in rows 2 and 7.");
    expect(text.why[0]).toBe("In row 2, 5 can only go in r2c3 or r2c8.");
    expect(text.why[2]).toBe("If r2c3 is 5, then row 7's 5 has to be r7c8; if r2c8 is 5, it has to be r7c3.");
    expect(text.why.at(-1)).toContain("no other cell in columns 3 and 8 can be 5");
  });

  it("swordfish and jellyfish explain the counting argument", () => {
    const s = open();
    rowOnly(s, 5, 1, [2, 5]);
    rowOnly(s, 5, 5, [5, 8]);
    rowOnly(s, 5, 9, [2, 8]);
    const sword = ladder(swordfish, s);
    checkLadder(sword.step, sword.text);
    expect(sword.text.why).toContain("So rows 1, 5 and 9 use up the 5s of all three columns: columns 2, 5 and 8.");
    const j = open();
    rowOnly(j, 6, 1, [1, 4]);
    rowOnly(j, 6, 3, [4, 6]);
    rowOnly(j, 6, 5, [6, 9]);
    rowOnly(j, 6, 7, [1, 9]);
    const jelly = ladder(jellyfish, j);
    checkLadder(jelly.step, jelly.text);
    expect(jelly.text.why.at(-1)).toContain("jellyfish");
  });

  it("finned x-wing explains the fin", () => {
    const s = open();
    rowOnly(s, 5, 2, [3, 8]);
    rowOnly(s, 5, 7, [3, 8, 9]);
    const { step, text } = ladder(finnedXWing, s);
    checkLadder(step, text);
    expect(text.what).toBe("The 5s in rows 2 and 7 almost fit in two columns — all but one in the bottom-right box.");
    expect(text.why).toContain("So either the fin r7c9 is 5, or the X-wing holds.");
    expect(text.why.at(-1)).toMatch(/^r8c8 and r9c8 lie in column 8 and see the fin\./);
  });

  it("skyscraper, kite and empty rectangle", () => {
    const sky = open();
    rowOnly(sky, 4, 3, [2, 6]);
    rowOnly(sky, 4, 7, [2, 5]);
    const a = ladder(skyscraper, sky);
    checkLadder(a.step, a.text);
    expect(a.text.why[1]).toBe("r3c2 and r7c2 are both in column 2, so at most one of them is 4.");
    expect(a.text.why[3]).toBe("r1c5, r2c5, r8c6 and r9c6 see both r3c6 and r7c5, so they can't be 4.");

    const kite = open();
    rowOnly(kite, 4, 2, [1, 7]);
    colOnly(kite, 4, 3, [1, 8]);
    const b = ladder(twoStringKite, kite);
    checkLadder(b.step, b.text);
    expect(b.text.what).toBe("Row 2 and column 3 each have only two places for 4, and they meet in the top-left box.");

    const er = open();
    boxOnly(er, 7, 1, ["r1c2", "r2c1", "r2c3", "r3c2"]);
    colOnly(er, 7, 6, [2, 7]);
    const c = ladder(emptyRectangle, er);
    checkLadder(c.step, c.text);
    expect(c.text.why[2]).toBe(
      "If r2c6 is 7, then row 2's 7 is outside the top-left box, so the box's 7 must be on column 2 — and r7c2, further along column 2, can't be 7.",
    );
    expect(c.text.why[3]).toBe("If r2c6 isn't 7, then r7c6 is, and r7c2 sees it (same row).");
  });

  it("xyz-wing and w-wing", () => {
    const xyz = ladder(xyzWing, stateWith(PLAIN, { r5c5: "149", r5c2: "19", r4c6: "49" }));
    checkLadder(xyz.step, xyz.text);
    expect(xyz.text.why[0]).toBe("r5c5 can be 1, 4 or 9. r4c6 can only be 4 or 9, and r5c2 only 1 or 9.");

    const w = stateWith(PLAIN, { r1c2: "38", r8c6: "38" });
    colOnly(w, 3, 4, [1, 8]);
    const ww = ladder(wWing, w);
    checkLadder(ww.step, ww.text);
    expect(ww.text.why[2]).toBe(
      "Suppose r1c2 isn't 8. Then it's 3, so r1c4 isn't 3 (same row), so r8c4 is 3, so r8c6 isn't 3 (same row) — it's 8.",
    );
  });

  it("simple colouring lists the pairs, the two colours and the trap", () => {
    const s = open();
    rowOnly(s, 6, 1, [2, 7]);
    colOnly(s, 6, 7, [1, 5]);
    rowOnly(s, 6, 5, [4, 7]);
    colOnly(s, 6, 4, [5, 8]);
    rowOnly(s, 6, 8, [1, 4]);
    const { step, text } = ladder(simpleColoring, s);
    checkLadder(step, text);
    expect(text.why[1]).toBe(
      "Chain those pairs together: r1c2–r1c7 (row 1), r1c7–r5c7 (column 7), r5c7–r5c4 (row 5), r5c4–r8c4 (column 4) and r8c4–r8c1 (row 8).",
    );
    expect(text.why[2]).toBe(
      "Colour the cells alternately along the chain. One colour: r1c2, r5c7 and r8c4. The other: r1c7, r5c4 and r8c1. One colour is all 6s and the other has none.",
    );
    expect(text.why).toContain("The same goes for r7c2 and r9c2: each sees both colours.");
  });

  it("colour wrap names the clash", () => {
    const s = open();
    rowOnly(s, 2, 1, [1, 5]);
    colOnly(s, 2, 5, [1, 6]);
    rowOnly(s, 2, 6, [2, 5]);
    colOnly(s, 2, 2, [3, 6]);
    const { step, text } = ladder(simpleColoring, s);
    checkLadder(step, text);
    expect(text.why[3]).toBe(
      "r1c1 and r3c2 have the same colour and share the top-left box, so they can't both be 2. Their colour must be the one with no 2s.",
    );
  });

  it("unique rectangles and BUG+1", () => {
    const t1 = ladder(uniqueRectangle, stateWith(PLAIN, { r1c1: "26", r1c4: "26", r3c1: "26", r3c4: "269" }));
    checkLadder(t1.step, t1.text);
    expect(t1.text.why[0]).toBe("r1c1, r1c4 and r3c1 can only be 2 or 6. r3c4 can be 2 or 6 too, but also 9.");
    expect(t1.text.why[2]).toBe("A proper puzzle has only one solution, so r3c4 can't be 2 or 6.");

    const t2 = ladder(uniqueRectangle, stateWith(PLAIN, { r1c1: "26", r1c4: "26", r3c1: "267", r3c4: "267" }));
    checkLadder(t2.step, t2.text);
    expect(t2.text.why[2]).toMatch(/^A proper puzzle has only one solution, so one of r3c1 and r3c4 is 7\./);

    const s4 = stateWith(PLAIN, { r1c1: "26", r1c4: "26", r3c1: "2678", r3c4: "269" });
    rowOnly(s4, 2, 3, [1, 4]);
    const t4 = ladder(uniqueRectangle, s4);
    checkLadder(t4.step, t4.text);
    expect(t4.text.why[2]).toBe("In row 3, 2 can only go in r3c1 or r3c4, so one of them is 2.");

    const solution = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
    const p = classic(solution.replace(/[123]/g, "."));
    const s = stateWith(p);
    const pair: Record<string, number> = { "1": 0b0110, "2": 0b1100, "3": 0b1010 };
    for (let c = 0; c < 81; c++) if ("123".includes(solution[c]!)) s.cand[c] = pair[solution[c]!]!;
    s.cand[cell("r1c8")] = 0b1110;
    const bug = ladder(bugPlusOne, s, p);
    checkLadder(bug.step, bug.text);
    expect(bug.text.why[0]).toBe("Every empty cell has exactly two candidates except r1c8, which has three: 1, 2 and 3.");
    expect(bug.text.do).toBe("Place 3 in r1c8.");
  });

  it("x-chain narrates link by link", () => {
    const s = open();
    rowOnly(s, 7, 1, [2, 6]);
    rowOnly(s, 7, 4, [6, 8]);
    rowOnly(s, 7, 8, [3, 8]);
    const { step, text } = ladder(xChain, s);
    checkLadder(step, text);
    expect(text.why).toEqual([
      "If r1c2 isn't 7, then r1c6 is 7 (the only other 7 in row 1).",
      "That means r4c6 isn't 7 (same column as r1c6), so r4c8 is 7 (the only other 7 in row 4).",
      "That means r8c8 isn't 7 (same column as r4c8), so r8c3 is 7 (the only other 7 in row 8).",
      "So if r1c2 isn't 7, then r8c3 is 7: either r1c2 is 7 or r8c3 is 7 (maybe both).",
      "r2c3, r3c3, r7c2 and r9c2 see both r1c2 and r8c3, so they can't be 7.",
    ]);
  });

  it("xy-chain and aic narrate cell links", () => {
    const xy = ladder(xyChain, stateWith(PLAIN, { r1c1: "12", r1c5: "23", r5c5: "34", r5c9: "14" }));
    checkLadder(xy.step, xy.text);
    expect(xy.text.why[0]).toBe("If r1c1 isn't 1, then it's 2 (its only other candidate).");
    expect(xy.text.why[1]).toBe("That means r1c5 isn't 2 (same row as r1c1), so it's 3 (its only other candidate).");

    const s = stateWith(PLAIN, { r6c2: "47" });
    rowOnly(s, 4, 1, [1, 5]);
    colOnly(s, 7, 5, [1, 6]);
    const a = ladder(aic, s);
    checkLadder(a.step, a.text);
    expect(a.text.why[1]).toBe("That means r1c5 isn't 7 (it's 4), so r6c5 is 7 (the only other 7 in column 5).");

    const x = stateWith(PLAIN, { r5c1: "13", r5c9: "2345" });
    colOnly(x, 1, 1, [1, 5]);
    rowOnly(x, 3, 5, [1, 9]);
    colOnly(x, 2, 9, [1, 5]);
    const cross = ladder(aic, x);
    checkLadder(cross.step, cross.text);
    expect(cross.text.why).toContain("r1c1 can't be 2: if r1c9 is 2, r1c1 sees it (same row); if r1c1 is 1, it isn't 2.");
  });
});
