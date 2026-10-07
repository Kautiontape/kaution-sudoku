/**
 * Queens game model: the player's marks (empty / ✕ / queen), undo/redo, conflicts, completion
 * events and hint application. Pure TS.
 *
 * Auto-cross is derived, not stored: cells attacked by a placed queen *display* as crossed when the
 * setting is on, so removing a queen cleanly un-crosses them and undo history stays small.
 */
import { attacks, makeBoard, rowOf, colOf, type QBoard } from "../engine/queens/geometry";
import { queensHint, type QueensHint, type RegionNamer } from "../engine/queens/hints";
import { CROSS, EMPTY, QUEEN, type QCell, type QueensPuzzle, type Unit } from "../engine/queens/types";

export type QueensEvent =
  | { type: "mark"; cell: QCell; mark: number; prev: number }
  | { type: "queen"; cell: QCell; correct: boolean; conflicts: QCell[] }
  | { type: "marks"; cells: QCell[] }
  | { type: "complete"; cell: QCell; units: Unit[] }
  | { type: "solved" }
  | { type: "history"; kind: "undo" | "redo"; cells: QCell[] };

interface Change {
  cell: QCell;
  from: number;
  to: number;
}

export interface SavedQueens {
  v: 1;
  puzzleId: string;
  marks: number[];
  elapsed: number;
  mistakes: number;
  hints: number;
  rungs: number[];
  solved: boolean;
}

export class QueensGame {
  readonly puzzle: QueensPuzzle;
  readonly n: number;
  readonly board: QBoard;
  marks: Uint8Array;
  elapsedMs = 0;
  mistakes = 0;
  hintsUsed = 0;
  rungs = [0, 0, 0, 0, 0];
  solved = false;
  settings = { checkMistakes: true };
  private undoStack: Change[][] = [];
  private redoStack: Change[][] = [];
  private listeners = new Set<(e: QueensEvent) => void>();

  constructor(puzzle: QueensPuzzle, saved?: SavedQueens | null) {
    this.puzzle = puzzle;
    this.n = puzzle.n;
    this.board = makeBoard(puzzle);
    this.marks = new Uint8Array(puzzle.n * puzzle.n);
    if (saved && saved.puzzleId === puzzle.id && saved.marks.length === this.marks.length) {
      this.marks = Uint8Array.from(saved.marks);
      this.elapsedMs = saved.elapsed;
      this.mistakes = saved.mistakes;
      this.hintsUsed = saved.hints;
      this.rungs = [...saved.rungs, 0, 0, 0, 0, 0].slice(0, 5);
      this.solved = saved.solved;
    }
  }

  on(fn: (e: QueensEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(e: QueensEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  region(c: QCell): number {
    return this.puzzle.regions[c]!;
  }

  isSolutionCell(c: QCell): boolean {
    return this.puzzle.solution[rowOf(c, this.n)] === colOf(c, this.n);
  }

  queens(): QCell[] {
    const out: QCell[] = [];
    this.marks.forEach((m, c) => m === QUEEN && out.push(c));
    return out;
  }

  /** Cells attacked by at least one placed queen (for auto-cross display). */
  attacked(): Uint8Array {
    const a = new Uint8Array(this.marks.length);
    for (const q of this.queens()) for (const c of attacks(this.board, q)) if (c !== q) a[c] = 1;
    return a;
  }

  /** Queens that break a rule with another queen. */
  conflicts(): Set<QCell> {
    const qs = this.queens();
    const bad = new Set<QCell>();
    for (let i = 0; i < qs.length; i++)
      for (let j = i + 1; j < qs.length; j++) {
        const a = qs[i]!;
        const b = qs[j]!;
        if (attacks(this.board, a).includes(b)) {
          bad.add(a);
          bad.add(b);
        }
      }
    return bad;
  }

  progress(): number {
    return this.queens().filter((q) => this.isSolutionCell(q)).length / this.n;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private commit(changes: Change[]): Change[] {
    const real = changes.filter((c) => c.from !== c.to);
    if (!real.length) return real;
    for (const ch of real) this.marks[ch.cell] = ch.to;
    this.undoStack.push(real);
    if (this.undoStack.length > 500) this.undoStack.shift();
    this.redoStack = [];
    return real;
  }

  /** Tap cycle: empty → ✕ → queen → empty. */
  cycle(cell: QCell): void {
    const m = this.marks[cell]!;
    this.setMark(cell, m === EMPTY ? CROSS : m === CROSS ? QUEEN : EMPTY);
  }

  setMark(cell: QCell, mark: number): void {
    if (this.solved) return;
    const prev = this.marks[cell]!;
    if (!this.commit([{ cell, from: prev, to: mark }]).length) return;
    this.emit({ type: "mark", cell, mark, prev });
    if (mark === QUEEN) this.afterQueen(cell);
  }

  /** Drag-to-cross: mark several empty cells at once (one undo step). */
  crossCells(cells: QCell[]): void {
    if (this.solved) return;
    const changed = this.commit(cells.filter((c) => this.marks[c] === EMPTY).map((c) => ({ cell: c, from: EMPTY, to: CROSS })));
    if (changed.length) this.emit({ type: "marks", cells: changed.map((c) => c.cell) });
  }

  private afterQueen(cell: QCell): void {
    const correct = this.isSolutionCell(cell);
    const conflicts = [...this.conflicts()].filter((q) => q !== cell && attacks(this.board, cell).includes(q));
    if (!correct && this.settings.checkMistakes) this.mistakes++;
    this.emit({ type: "queen", cell, correct, conflicts });
    if (correct) {
      const units: Unit[] = [
        { type: "row", index: rowOf(cell, this.n) },
        { type: "col", index: colOf(cell, this.n) },
        { type: "region", index: this.region(cell) },
      ];
      this.emit({ type: "complete", cell, units });
      this.checkSolved();
    }
  }

  private checkSolved(): void {
    if (this.solved) return;
    const qs = this.queens();
    if (qs.length !== this.n || !qs.every((q) => this.isSolutionCell(q))) return;
    this.solved = true;
    this.emit({ type: "solved" });
  }

  clearAll(): void {
    if (this.solved) return;
    const changed = this.commit([...this.marks].map((m, c) => ({ cell: c, from: m, to: EMPTY })));
    if (changed.length) this.emit({ type: "marks", cells: changed.map((c) => c.cell) });
  }

  undo(): void {
    const e = this.undoStack.pop();
    if (!e) return;
    for (const ch of e) this.marks[ch.cell] = ch.from;
    this.redoStack.push(e);
    this.solved = false;
    this.emit({ type: "history", kind: "undo", cells: e.map((c) => c.cell) });
  }

  redo(): void {
    const e = this.redoStack.pop();
    if (!e) return;
    for (const ch of e) this.marks[ch.cell] = ch.to;
    this.undoStack.push(e);
    this.emit({ type: "history", kind: "redo", cells: e.map((c) => c.cell) });
    this.checkSolved();
  }

  hint(names?: RegionNamer): QueensHint {
    return queensHint(this.puzzle, this.marks, names);
  }

  recordRung(r: number): void {
    if (r >= 0 && r < this.rungs.length) this.rungs[r]!++;
  }

  applyHint(h: QueensHint): void {
    if (this.solved) return;
    this.hintsUsed++;
    const changes: Change[] = [];
    if (h.kind === "step" && h.step) {
      for (const c of h.step.eliminations) if (this.marks[c] === EMPTY) changes.push({ cell: c, from: EMPTY, to: CROSS });
      for (const c of h.step.placements) changes.push({ cell: c, from: this.marks[c]!, to: QUEEN });
    } else if (h.kind === "mistake") {
      for (const c of h.wrongCells ?? []) changes.push({ cell: c, from: this.marks[c]!, to: EMPTY });
    } else if (h.kind === "notes") {
      for (const c of h.wrongCells ?? []) changes.push({ cell: c, from: this.marks[c]!, to: EMPTY });
    }
    const real = this.commit(changes);
    if (!real.length) return;
    this.emit({ type: "marks", cells: real.map((c) => c.cell) });
    for (const ch of real) if (ch.to === QUEEN) this.afterQueen(ch.cell);
  }

  toJSON(): SavedQueens {
    return {
      v: 1,
      puzzleId: this.puzzle.id,
      marks: Array.from(this.marks),
      elapsed: Math.round(this.elapsedMs),
      mistakes: this.mistakes,
      hints: this.hintsUsed,
      rungs: [...this.rungs],
      solved: this.solved,
    };
  }
}
