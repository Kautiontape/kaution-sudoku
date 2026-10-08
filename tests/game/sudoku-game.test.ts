import { maskOf } from "../../src/engine/combos";
import type { Puzzle, Step } from "../../src/engine/types";
import { SudokuGame, type GameEvent } from "../../src/game/sudoku-game";
import { cage, cell, classic } from "../engine/helpers";

const WIKI = classic(
  "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179",
);

function track(g: SudokuGame): GameEvent[] {
  const events: GameEvent[] = [];
  g.on((e) => events.push(e));
  return events;
}

describe("SudokuGame", () => {
  it("places digits and auto-clears peers' notes; undo/redo restore both", () => {
    const g = new SudokuGame(WIKI);
    g.toggleNote(cell("r1c4"), 4);
    g.toggleNote(cell("r9c3"), 4);
    expect(g.notes[cell("r1c4")]).toBe(maskOf([4]));
    g.place(cell("r1c3"), 4); // correct
    expect(g.grid[cell("r1c3")]).toBe(4);
    expect(g.notes[cell("r1c4")]).toBe(0); // same row
    expect(g.notes[cell("r9c3")]).toBe(0); // same column
    g.undo();
    expect(g.grid[cell("r1c3")]).toBe(0);
    expect(g.notes[cell("r1c4")]).toBe(maskOf([4]));
    g.redo();
    expect(g.grid[cell("r1c3")]).toBe(4);
    expect(g.notes[cell("r1c4")]).toBe(0);
  });

  it("explains a provable mistake (row clash) and counts it", () => {
    const g = new SudokuGame(WIKI);
    const ev = track(g);
    g.place(cell("r1c3"), 5); // r1c1 is 5
    const e = ev.find((x) => x.type === "place");
    expect(e).toMatchObject({ type: "place", correct: false, reason: { kind: "house", other: cell("r1c1") } });
    expect(g.mistakes).toBe(1);
    expect(g.isWrong(cell("r1c3"))).toBe(true);
  });

  it("does not count mistakes when checking is off", () => {
    const g = new SudokuGame(WIKI);
    g.settings.checkMistakes = false;
    g.place(cell("r1c3"), 5);
    expect(g.mistakes).toBe(0);
  });

  it("killer: duplicate in cage and impossible sum are explained", () => {
    const p: Puzzle = {
      id: "k",
      kind: "killer",
      cages: [cage(0, 3, ["r1c1", "r1c2"]), cage(1, 10, ["r1c3", "r1c4"])],
      solution: "123456789456789123789123456234567891567891234891234567345678912678912345912345678",
    };
    const g = new SudokuGame(p);
    expect(g.mistakeReason(cell("r1c1"), 5)).toMatchObject({ kind: "cage-sum", sum: 3 });
    g.place(cell("r1c3"), 3);
    expect(g.mistakeReason(cell("r1c4"), 3)).toMatchObject({ kind: "house" }); // same row wins
  });

  it("emits completion for a finished row and solved at the end", () => {
    const g = new SudokuGame(WIKI);
    const ev = track(g);
    const sol = WIKI.solution!;
    // Fill row 1.
    for (let c = 0; c < 9; c++) if (!g.grid[c]) g.place(c, Number(sol[c]));
    const complete = ev.filter((e) => e.type === "complete");
    expect(complete.some((e) => e.type === "complete" && e.houses.some((h) => h.kind === "row" && h.index === 0))).toBe(true);
    for (let c = 0; c < 81; c++) if (!g.grid[c]) g.place(c, Number(sol[c]));
    expect(g.solved).toBe(true);
    expect(ev.some((e) => e.type === "solved")).toBe(true);
  });

  it("applies a step hint as one undoable action", () => {
    const g = new SudokuGame(WIKI);
    const h = g.hint();
    expect(h.kind).toBe("step");
    g.applyHint(h);
    const p = h.step!.placements[0]!;
    expect(g.grid[p.cell]).toBe(p.digit);
    expect(g.hintsUsed).toBe(1);
    g.undo();
    expect(g.grid[p.cell]).toBe(0);
  });

  it("applies an elimination hint by writing notes", () => {
    const g = new SudokuGame(WIKI);
    // Walk hints until an elimination step appears (or the puzzle is solved).
    for (let i = 0; i < 200 && !g.solved; i++) {
      const h = g.hint();
      if (h.kind !== "step") break;
      if (h.step!.eliminations.length) {
        g.applyHint(h);
        const e = h.step!.eliminations[0]!;
        expect(g.notes[e.cell]! & (1 << e.digit)).toBe(0);
        expect(g.notes[e.cell]).not.toBe(0);
        return;
      }
      g.applyHint(h);
    }
    expect(g.solved).toBe(true); // all singles: fine too
  });

  it("bulk-pencils a digit across cells as one undo step, toggling off when all have it", () => {
    const g = new SudokuGame(WIKI);
    const cells = [cell("r1c3"), cell("r1c4"), cell("r1c1")]; // r1c1 is a given: skipped
    g.toggleNote(cell("r1c3"), 2);
    g.toggleNoteMany(cells, 2);
    expect(g.notes[cell("r1c3")]).toBe(maskOf([2]));
    expect(g.notes[cell("r1c4")]).toBe(maskOf([2]));
    g.toggleNoteMany(cells, 2); // all have it → remove everywhere
    expect(g.notes[cell("r1c3")]).toBe(0);
    expect(g.notes[cell("r1c4")]).toBe(0);
    g.undo();
    expect(g.notes[cell("r1c4")]).toBe(maskOf([2]));
  });

  it("erases a whole selection — digits and notes, givens untouched — as one undo step", () => {
    const g = new SudokuGame(WIKI);
    g.place(cell("r1c3"), 4);
    g.toggleNote(cell("r1c4"), 6);
    g.toggleNote(cell("r1c4"), 2);
    const events = track(g);
    g.eraseMany([cell("r1c3"), cell("r1c4"), cell("r1c1"), cell("r1c6")]); // r1c1 given, r1c6 already empty
    expect(g.grid[cell("r1c3")]).toBe(0);
    expect(g.notes[cell("r1c4")]).toBe(0);
    expect(g.grid[cell("r1c1")]).toBe(5);
    expect(events).toContainEqual({ type: "erase", cells: [cell("r1c3"), cell("r1c4")] });
    g.undo();
    expect(g.grid[cell("r1c3")]).toBe(4);
    expect(g.notes[cell("r1c4")]).toBe(maskOf([2, 6]));
  });

  it("remembers what a hint rules out for the next hint, never writing it into the notes", () => {
    const g = new SudokuGame(WIKI);
    const step = {
      technique: "pointing",
      tier: 2,
      rating: 2,
      placements: [],
      eliminations: [{ cell: cell("r1c3"), digit: 1 as const }],
      focus: { cells: [], cages: [], houses: [] },
      explain: {},
    } as unknown as Step;
    g.applyHint({ kind: "step", title: "Pointing", ladder: { where: "", what: "", why: [], do: "" }, step, prior: [] });
    expect(g.known[cell("r1c3")]).toBe(maskOf([1]));
    expect(g.notes[cell("r1c3")]).toBe(0);
    expect(g.hintCandidates()[cell("r1c3")]! & maskOf([1])).toBe(0);
    const restored = new SudokuGame(WIKI, JSON.parse(JSON.stringify(g.toJSON())));
    expect(restored.known[cell("r1c3")]).toBe(maskOf([1]));
  });

  it("serializes and restores progress", () => {
    const g = new SudokuGame(WIKI);
    g.place(cell("r1c3"), 4);
    g.toggleNote(cell("r1c4"), 6);
    g.elapsedMs = 12345;
    const saved = JSON.parse(JSON.stringify(g.toJSON()));
    const h = new SudokuGame(WIKI, saved);
    expect(h.grid[cell("r1c3")]).toBe(4);
    expect(h.notes[cell("r1c4")]).toBe(maskOf([6]));
    expect(h.elapsedMs).toBe(12345);
  });
});
