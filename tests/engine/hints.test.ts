import { readFileSync } from "node:fs";
import { basicCandidates, comboCandidates, gridFromPuzzle } from "../../src/engine/candidates";
import { techniqueInfo, SUDOKU_CATALOG } from "../../src/engine/catalog";
import { bit, maskOf } from "../../src/engine/combos";
import { cellName } from "../../src/engine/geometry";
import { hintMarks, shownCandidates, sudokuHint } from "../../src/engine/hints/index";
import { TEMPLATES } from "../../src/engine/hints/registry";
import { decodeSudoku, encodeSudoku, type SudokuPackEntry } from "../../src/engine/pack";
import { generateClassic, generateKiller } from "../../src/engine/puzzles";
import { createState } from "../../src/engine/state";
import { TECHNIQUES } from "../../src/engine/techniques";
import type { CandidateMark, Puzzle, Step } from "../../src/engine/types";
import { parseSolution } from "../../src/engine/validate";
import { cage, cell, classic, withDigits } from "./helpers";

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

  it("leaves notes alone that merely miss the answer: notes say what a cell might be, not all it can be", () => {
    const notes = new Uint16Array(81);
    notes[cell("r1c3")] = maskOf([1, 2]); // the answer is 4, but 1 and 2 are both still possible there
    const h = sudokuHint(input(WIKI, gridFromPuzzle(WIKI), notes));
    expect(h.kind).toBe("step");
  });

  it("flags a note that's impossible — the digit is already in that row, column or box", () => {
    const notes = new Uint16Array(81);
    notes[cell("r1c3")] = maskOf([4, 5]); // r1c1 is a 5
    const h = sudokuHint(input(WIKI, gridFromPuzzle(WIKI), notes));
    expect(h.kind).toBe("notes");
    expect(h.fix).toEqual({ removeNotes: [{ cell: cell("r1c3"), mask: maskOf([5]) }] });
    expect(h.ladder.why[0]).toContain("r1c1");
    expect(h.ladder.do).toBe("Remove 5 from r1c3's notes.");
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

  it("reasons from the board, not from the player's notes", () => {
    const grid = gridFromPuzzle(WIKI);
    const notes = Uint16Array.from(createState(WIKI, grid).cand);
    notes[cell("r1c3")] = maskOf([4]);
    const a = sudokuHint(input(WIKI, grid, notes));
    const b = sudokuHint(input(WIKI, grid));
    expect(a.step).toEqual(b.step);
  });
});

describe("what a hint pencils", () => {
  const step = (marks: Step["marks"], eliminations: Step["eliminations"] = []): Step =>
    ({ technique: "pointing", tier: 2, rating: 2, placements: [], eliminations, focus: { cells: [], cages: [], houses: [] }, explain: {}, marks }) as unknown as Step;
  const at = (marks: CandidateMark[]) => marks.map((m) => `${cellName(m.cell)}:${m.digit}:${m.role}`).sort();

  it("marks every step's squares, struck candidates stay struck, and 'every other 9' pencils nothing", () => {
    const first = step([{ cell: cell("r1c1"), digit: 9, role: "key" }], [{ cell: cell("r1c3"), digit: 9 }]);
    const last = step([
      { cell: cell("r1c1"), digit: 9, role: "alt" }, // a later role wins…
      { cell: cell("r1c3"), digit: 9, role: "key" }, // …but not over a strike
      { cell: cell("r2c4"), digit: 9, role: "key" },
      { cell: cell("r2c1"), digit: 9, role: "elim" },
      { cell: cell("r5c5"), digit: 9, role: "digit" },
    ]);
    expect(at(hintMarks({ prior: [first], step: last }))).toEqual(["r1c1:9:alt", "r1c3:9:elim", "r2c1:9:elim", "r2c4:9:key"]);
    expect(hintMarks({})).toEqual([]);
  });

  it("pencils what a note may hold — cage sums applied in killer — minus what hints ruled out", () => {
    const p = withDigits({}, [cage(0, 16, ["r1c1", "r1c2"])]);
    const grid = gridFromPuzzle(p);
    expect(shownCandidates(p, grid)[cell("r1c1")]).toBe(maskOf([7, 9]));
    const known = new Uint16Array(81);
    known[cell("r1c1")] = maskOf([7]);
    known[cell("r1c2")] = maskOf([7, 9]); // would leave nothing: ignored
    const shown = shownCandidates(p, grid, known);
    expect(shown[cell("r1c1")]).toBe(maskOf([9]));
    expect(shown[cell("r1c2")]).toBe(maskOf([7, 9]));
    expect(shownCandidates(WIKI, gridFromPuzzle(WIKI))).toEqual(basicCandidates(WIKI, gridFromPuzzle(WIKI)));
  });
});

interface Played {
  /** Narrowing steps before each placing hint. */
  prior: number[];
  /** Hints that only narrowed things down (rounds on a long route). */
  stones: number;
}

/**
 * Play a pack puzzle out on hints alone, remembering what each rules out as the game does. Every
 * hint must be sound: placements right, eliminations never the answer, at most three steps shown.
 */
function playOut(p: Puzzle): Played {
  const grid = gridFromPuzzle(p);
  const solution = parseSolution(p.solution!);
  const known = new Uint16Array(81);
  const out: Played = { prior: [], stones: 0 };
  for (let k = 0; k < 400; k++) {
    const h = sudokuHint({ puzzle: p, grid, notes: new Uint16Array(81), solution, known });
    if (h.kind === "solved") return out;
    expect(h.kind).toBe("step");
    const steps = [...(h.prior ?? []), h.step!];
    expect(steps.length).toBeLessThanOrEqual(4);
    for (const s of steps.slice(0, -1)) expect(s.placements).toEqual([]);
    for (const s of steps)
      for (const e of s.eliminations) {
        expect(solution[e.cell]).not.toBe(e.digit);
        known[e.cell]! |= bit(e.digit);
      }
    for (const pl of h.step!.placements) {
      expect(pl.digit).toBe(solution[pl.cell]);
      grid[pl.cell] = pl.digit;
    }
    if (h.step!.placements.length) out.prior.push(h.prior?.length ?? 0);
    else out.stones++;
  }
  throw new Error("hints didn't finish the puzzle");
}

const packPuzzle = (file: string, i: number): Puzzle =>
  decodeSudoku((JSON.parse(readFileSync(`public/packs/${file}.json`, "utf8")) as { puzzles: SudokuPackEntry[] }).puzzles[i]!);

describe("hints point at the next digit", () => {
  it("hints alone solve a classic expert puzzle, nearly always going straight for a digit", () => {
    const { prior, stones } = playOut(packPuzzle("classic-expert", 0));
    expect(prior.filter((n) => n === 0).length / prior.length).toBeGreaterThan(0.85);
    expect(stones).toBeLessThan(10);
  });

  it("killer hints mostly place a digit outright; long routes come in short rounds", () => {
    for (const [file, i] of [["killer-easy", 0], ["killer-hard", 3], ["killer-expert", 1]] as const) {
      const { prior, stones } = playOut(packPuzzle(file, i));
      expect(prior.filter((n) => n === 0).length / (prior.length + stones)).toBeGreaterThan(0.6);
    }
  });

  it("a long route is taught a round at a time, aimed at a named square", () => {
    const p = packPuzzle("killer-expert", 1);
    const grid = gridFromPuzzle(p);
    const solution = parseSolution(p.solution!);
    const known = new Uint16Array(81);
    for (let k = 0; k < 200; k++) {
      const h = sudokuHint({ puzzle: p, grid, notes: new Uint16Array(81), solution, known });
      expect(h.kind).toBe("step");
      if (!h.step!.placements.length) {
        expect(h.ladder.what).toMatch(/on the way to r\dc\d\.$/);
        expect(h.ladder.do).toMatch(/^Pencil it in: /);
        // The next hint builds on it instead of repeating it.
        for (const s of [...(h.prior ?? []), h.step!]) for (const e of s.eliminations) known[e.cell]! |= bit(e.digit);
        const next = sudokuHint({ puzzle: p, grid, notes: new Uint16Array(81), solution, known });
        expect(next.ladder).not.toEqual(h.ladder);
        return;
      }
      for (const s of [...(h.prior ?? []), h.step!]) for (const e of s.eliminations) known[e.cell]! |= bit(e.digit);
      for (const pl of h.step!.placements) grid[pl.cell] = pl.digit;
    }
    throw new Error("no long route in this puzzle");
  });

  it("explains a chain: the narrowing steps, then how you know, then a nudge toward notes", () => {
    // Find a killer hint that needs narrowing first.
    const p = packPuzzle("killer-hard", 3);
    const grid = gridFromPuzzle(p);
    const solution = parseSolution(p.solution!);
    const known = new Uint16Array(81);
    for (let k = 0; k < 200; k++) {
      const h = sudokuHint({ puzzle: p, grid, notes: new Uint16Array(81), solution, known });
      if (h.kind !== "step") break;
      if (h.prior?.length && h.step!.placements.length) {
        expect(h.ladder.why[0]).toMatch(/^First/);
        expect(h.ladder.why.some((w) => /notes/i.test(w))).toBe(true);
        expect(h.ladder.do).toMatch(/^Place \d in r\dc\d\.$/);
        return;
      }
      for (const s of [...(h.prior ?? []), h.step!]) for (const e of s.eliminations) known[e.cell]! |= bit(e.digit);
      for (const pl of h.step!.placements) grid[pl.cell] = pl.digit;
    }
    throw new Error("no chained hint found in this puzzle");
  });

  it("flags a killer note no cage combination allows", () => {
    const p = packPuzzle("killer-easy", 0);
    const grid = gridFromPuzzle(p);
    const basic = basicCandidates(p, grid);
    const combo = comboCandidates(p, grid);
    let target = -1;
    let digit = 0;
    for (let c = 0; c < 81 && target < 0; c++)
      for (let d = 1; d <= 9; d++)
        if (basic[c]! & bit(d) && !(combo[c]! & bit(d))) {
          target = c;
          digit = d;
          break;
        }
    expect(target).toBeGreaterThanOrEqual(0);
    const notes = new Uint16Array(81);
    notes[target] = bit(digit) | (combo[target]! & -combo[target]!); // the impossible digit plus a possible one
    const h = sudokuHint({ puzzle: p, grid, notes, solution: parseSolution(p.solution!) });
    expect(h.kind).toBe("notes");
    expect(h.ladder.why[0]).toMatch(/cage/);
    expect(h.fix).toEqual({ removeNotes: [{ cell: target, mask: bit(digit) }] });
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
