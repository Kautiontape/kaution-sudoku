import { gridFromPuzzle } from "../../src/engine/candidates";
import { techniqueInfo, SUDOKU_CATALOG } from "../../src/engine/catalog";
import { maskOf } from "../../src/engine/combos";
import { sudokuHint } from "../../src/engine/hints/index";
import { TEMPLATES } from "../../src/engine/hints/registry";
import { decodeSudoku, encodeSudoku } from "../../src/engine/pack";
import { generateClassic, generateKiller } from "../../src/engine/puzzles";
import { createState } from "../../src/engine/state";
import { TECHNIQUES } from "../../src/engine/techniques";
import type { Puzzle } from "../../src/engine/types";
import { parseSolution } from "../../src/engine/validate";
import { cell, classic } from "./helpers";

const WIKI = classic(
  "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179",
);
const SOL = parseSolution(WIKI.solution!);

function input(p: Puzzle, grid = gridFromPuzzle(p), notes = new Uint16Array(81)) {
  return { puzzle: p, grid, notes, solution: parseSolution(p.solution!) };
}

describe("sudokuHint ordering", () => {
  it("flags a wrong digit first, explaining a visible clash", () => {
    const grid = gridFromPuzzle(WIKI);
    grid[cell("r1c3")] = 5; // row 1 already has a 5 at r1c1
    const h = sudokuHint(input(WIKI, grid));
    expect(h.kind).toBe("mistake");
    expect(h.cells).toEqual([cell("r1c3")]);
    expect(h.ladder.why[0]).toContain("r1c1");
    expect(h.fix).toEqual({ clear: [cell("r1c3")] });
  });

  it("flags a wrong digit with no visible clash as not matching the solution", () => {
    const grid = gridFromPuzzle(WIKI);
    grid[cell("r1c3")] = 2; // solution is 4; nothing in r1/c3/box1 is 2 yet
    const h = sudokuHint(input(WIKI, grid));
    expect(h.kind).toBe("mistake");
    expect(h.ladder.why[0]).toContain("doesn't match the solution");
  });

  it("then flags notes that exclude the answer", () => {
    const notes = new Uint16Array(81);
    notes[cell("r1c3")] = maskOf([1, 2]); // answer is 4
    const h = sudokuHint(input(WIKI, gridFromPuzzle(WIKI), notes));
    expect(h.kind).toBe("notes");
    expect(h.fix).toEqual({ resetNotes: [cell("r1c3")] });
    expect(h.ladder.why.join(" ")).not.toContain("4"); // doesn't give the answer away
  });

  it("otherwise gives the easiest logical step with a full ladder", () => {
    const h = sudokuHint(input(WIKI));
    expect(h.kind).toBe("step");
    expect(h.tier).toBe(1);
    expect(h.ladder.where).toMatch(/^Look at /);
    expect(h.ladder.why.length).toBeGreaterThan(0);
    expect(h.ladder.do).toMatch(/^Place \d in r\dc\d\.$/);
    const p = h.step!.placements[0]!;
    expect(SOL[p.cell]).toBe(p.digit);
  });

  it("reports solved", () => {
    expect(sudokuHint(input(WIKI, Uint8Array.from(SOL))).kind).toBe("solved");
  });

  it("offers to reveal a cell when no technique applies", () => {
    const h = sudokuHint({ ...input(WIKI), logical: { techniques: [] } });
    expect(h.kind).toBe("stuck");
    const r = h.fix!.reveal![0]!;
    expect(SOL[r.cell]).toBe(r.digit);
  });

  it("uses the player's notes as candidates (eliminations persist through notes)", () => {
    const grid = gridFromPuzzle(WIKI);
    const s = createState(WIKI, grid);
    const notes = Uint16Array.from(s.cand);
    // Narrow r1c3 to its answer: the next hint can now be a naked single there.
    notes[cell("r1c3")] = maskOf([4]);
    const h = sudokuHint(input(WIKI, grid, notes));
    expect(h.kind).toBe("step");
  });
});

describe("templates and catalog", () => {
  it("every registered technique has a template and a catalog entry", () => {
    for (const t of TECHNIQUES) {
      expect(TEMPLATES[t.id], `template for ${t.id}`).toBeDefined();
      expect(techniqueInfo(t.id), `catalog for ${t.id}`).toBeDefined();
    }
    for (const e of SUDOKU_CATALOG) expect(e.summary.length).toBeGreaterThan(10);
  });
});

describe("generation + packs", () => {
  it("classic generation is deterministic and graded as requested", () => {
    const a = generateClassic("easy", 5)!;
    const b = generateClassic("easy", 5)!;
    expect(a.puzzle).toEqual(b.puzzle);
    expect(a.puzzle.meta!.difficulty).toBe("easy");
    expect(a.grade.tier).toBe(1);
  });

  it("killer generation yields a logically solvable, graded puzzle", () => {
    const r = generateKiller("easy", 1)!;
    expect(r.puzzle.kind).toBe("killer");
    expect(r.puzzle.cages.reduce((a, c) => a + c.sum, 0)).toBe(405);
    expect(r.grade.tier).toBeLessThanOrEqual(2);
  });

  it("pack encoding round-trips", () => {
    const c = generateClassic("easy", 2)!.puzzle;
    const k = generateKiller("easy", 2)!.puzzle;
    for (const p of [c, k]) {
      const d = decodeSudoku(encodeSudoku(p));
      expect(d.kind).toBe(p.kind);
      expect(d.solution).toBe(p.solution);
      expect(d.givens).toEqual(p.givens ?? {});
      expect(d.cages.map((x) => [x.sum, x.cells])).toEqual(p.cages.map((x) => [x.sum, x.cells]));
    }
  });
});
