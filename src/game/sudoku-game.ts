/**
 * Sudoku game model (classic + killer): the player's digits and notes, undo/redo, mistake
 * reasons, completion events and hint application. Pure TS — the UI subscribes to events and
 * turns them into visuals and sound.
 */
import { basicCandidates, comboCandidates, gridFromPuzzle } from "../engine/candidates";
import { bit, cageCombos } from "../engine/combos";
import { CELL_HOUSES, HOUSE_CELLS, houseAt, PEERS } from "../engine/geometry";
import { sudokuHint, type SudokuHint } from "../engine/hints/index";
import { createState } from "../engine/state";
import { puzzleKind, type Cage, type CellId, type Digit, type House, type Puzzle, type PuzzleKind } from "../engine/types";
import { parseSolution } from "../engine/validate";

export type MistakeReason =
  | { kind: "house"; house: House; other: CellId }
  | { kind: "cage-dup"; cage: number; other: CellId }
  | { kind: "cage-sum"; cage: number; sum: number; size: number; rem: number; combos: number[] }
  | { kind: "solution" };

export interface Change {
  cell: CellId;
  digit: [number, number];
  notes: [number, number];
}

interface HistoryEntry {
  label: string;
  changes: Change[];
}

export type GameEvent =
  | { type: "place"; cell: CellId; digit: Digit; correct: boolean; reason?: MistakeReason; fromHint?: boolean }
  | { type: "erase"; cells: CellId[] }
  | { type: "note"; cell: CellId; digit: Digit; on: boolean }
  | { type: "notes"; cells: CellId[] }
  | { type: "complete"; cell: CellId; houses: House[]; cages: number[]; digits: Digit[] }
  | { type: "solved" }
  | { type: "history"; kind: "undo" | "redo"; cells: CellId[] };

export interface SudokuSettings {
  /** Remove a placed digit from the notes of its row/column/box/cage. */
  autoClearNotes: boolean;
  /** Flag wrong digits immediately (and count mistakes). */
  checkMistakes: boolean;
}

export interface SavedSudoku {
  v: 1;
  puzzleId: string;
  grid: number[];
  notes: number[];
  elapsed: number;
  mistakes: number;
  hints: number;
  rungs: number[];
  solved: boolean;
}

export class SudokuGame {
  readonly puzzle: Puzzle;
  readonly kind: PuzzleKind;
  readonly solution: Uint8Array;
  readonly given: Uint8Array;
  grid: Uint8Array;
  notes: Uint16Array;
  elapsedMs = 0;
  mistakes = 0;
  /** Hints applied (rung 4) or otherwise consumed. */
  hintsUsed = 0;
  /** How many times each rung (0..4) was revealed. */
  rungs = [0, 0, 0, 0, 0];
  solved = false;
  settings: SudokuSettings = { autoClearNotes: true, checkMistakes: true };

  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private listeners = new Set<(e: GameEvent) => void>();
  private cageIndex: Int16Array;

  constructor(puzzle: Puzzle, saved?: SavedSudoku | null) {
    if (!puzzle.solution) throw new Error("SudokuGame needs a puzzle with a solution");
    this.puzzle = puzzle;
    this.kind = puzzleKind(puzzle);
    this.solution = parseSolution(puzzle.solution);
    const g = gridFromPuzzle(puzzle);
    this.given = g.map((d) => (d ? 1 : 0));
    this.grid = Uint8Array.from(g);
    this.notes = new Uint16Array(81);
    this.cageIndex = new Int16Array(81).fill(-1);
    puzzle.cages.forEach((cage, i) => cage.cells.forEach((c) => (this.cageIndex[c] = i)));
    if (saved && saved.puzzleId === puzzle.id && saved.grid.length === 81) {
      for (let c = 0; c < 81; c++) {
        if (!this.given[c]) this.grid[c] = saved.grid[c] ?? 0;
        this.notes[c] = saved.notes[c] ?? 0;
      }
      this.elapsedMs = saved.elapsed;
      this.mistakes = saved.mistakes;
      this.hintsUsed = saved.hints;
      this.rungs = [...saved.rungs, 0, 0, 0, 0, 0].slice(0, 5);
      this.solved = saved.solved;
    }
  }

  on(fn: (e: GameEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: GameEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  cageOf(cell: CellId): Cage | undefined {
    const i = this.cageIndex[cell]!;
    return i >= 0 ? this.puzzle.cages[i] : undefined;
  }

  isWrong(cell: CellId): boolean {
    const d = this.grid[cell]!;
    return d !== 0 && d !== this.solution[cell];
  }

  /** How many of each digit are placed correctly (index 1..9). */
  digitCounts(): number[] {
    const out = new Array<number>(10).fill(0);
    for (let c = 0; c < 81; c++) if (this.grid[c] && this.grid[c] === this.solution[c]) out[this.grid[c]!]!++;
    return out;
  }

  filledCount(): number {
    let n = 0;
    for (let c = 0; c < 81; c++) if (this.grid[c] && this.grid[c] === this.solution[c]) n++;
    return n;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  // ------------------------------------------------------------------------------------------
  // Mutations (each one is a single undoable history entry)

  private commit(label: string, changes: Change[]): void {
    const real = changes.filter((ch) => ch.digit[0] !== ch.digit[1] || ch.notes[0] !== ch.notes[1]);
    if (!real.length) return;
    for (const ch of real) {
      this.grid[ch.cell] = ch.digit[1];
      this.notes[ch.cell] = ch.notes[1];
    }
    this.undoStack.push({ label, changes: real });
    if (this.undoStack.length > 500) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Changes for placing a digit: the cell itself plus peers' notes when auto-clear is on. */
  private placeChanges(cell: CellId, digit: Digit, pending: Map<CellId, Change>): void {
    const get = (c: CellId): Change => {
      let ch = pending.get(c);
      if (!ch) pending.set(c, (ch = { cell: c, digit: [this.grid[c]!, this.grid[c]!], notes: [this.notes[c]!, this.notes[c]!] }));
      return ch;
    };
    const self = get(cell);
    self.digit[1] = digit;
    self.notes[1] = 0;
    if (!this.settings.autoClearNotes) return;
    const off = ~bit(digit);
    const peers = new Set(PEERS[cell]);
    for (const c of this.cageOf(cell)?.cells ?? []) if (c !== cell) peers.add(c);
    for (const p of peers) {
      const ch = get(p);
      if (ch.notes[1] & bit(digit)) ch.notes[1] &= off;
    }
  }

  mistakeReason(cell: CellId, digit: Digit): MistakeReason {
    for (const h of CELL_HOUSES[cell]!)
      for (const c of HOUSE_CELLS[h]!) if (c !== cell && this.grid[c] === digit) return { kind: "house", house: houseAt(h), other: c };
    const cage = this.cageOf(cell);
    if (cage) {
      for (const c of cage.cells) if (c !== cell && this.grid[c] === digit) return { kind: "cage-dup", cage: cage.id, other: c };
      let rem = cage.sum;
      let used = 0;
      let empty = 0;
      for (const c of cage.cells) {
        if (c === cell || !this.grid[c]) empty++;
        else {
          rem -= this.grid[c]!;
          used |= bit(this.grid[c]!);
        }
      }
      const combos = cageCombos(empty, rem).filter((m) => !(m & used));
      if (!combos.some((m) => m & bit(digit)))
        return { kind: "cage-sum", cage: cage.id, sum: cage.sum, size: cage.cells.length, rem, combos };
    }
    return { kind: "solution" };
  }

  place(cell: CellId, digit: Digit, fromHint = false): void {
    if (this.solved || this.given[cell] || this.grid[cell] === digit) return;
    const correct = digit === this.solution[cell];
    const reason = correct ? undefined : this.mistakeReason(cell, digit);
    const pending = new Map<CellId, Change>();
    this.placeChanges(cell, digit, pending);
    this.commit(fromHint ? "hint" : "place", [...pending.values()]);
    if (!correct && this.settings.checkMistakes) this.mistakes++;
    this.emit({ type: "place", cell, digit, correct, reason, fromHint });
    if (correct) this.checkCompletion(cell);
  }

  erase(cell: CellId): void {
    this.eraseMany([cell]);
  }

  /** Wipe several cells at once — digits and notes; givens stay — as one undo step. */
  eraseMany(cells: readonly CellId[]): void {
    if (this.solved) return;
    const hit = cells.filter((c) => !this.given[c] && (this.grid[c] || this.notes[c]));
    if (!hit.length) return;
    this.commit("erase", hit.map((c): Change => ({ cell: c, digit: [this.grid[c]!, 0], notes: [this.notes[c]!, 0] })));
    this.emit({ type: "erase", cells: hit });
  }

  toggleNote(cell: CellId, digit: Digit): void {
    if (this.solved || this.grid[cell]) return;
    const before = this.notes[cell]!;
    const after = before ^ bit(digit);
    this.commit("note", [{ cell, digit: [0, 0], notes: [before, after] }]);
    this.emit({ type: "note", cell, digit, on: (after & bit(digit)) !== 0 });
  }

  /**
   * Pencil a digit into several cells at once (one undo step): if every empty cell already has it,
   * remove it from all of them; otherwise add it everywhere it's missing.
   */
  toggleNoteMany(cells: readonly CellId[], digit: Digit): void {
    if (this.solved) return;
    const empty = cells.filter((c) => !this.grid[c]);
    if (!empty.length) return;
    const b = bit(digit);
    const remove = empty.every((c) => this.notes[c]! & b);
    const changes: Change[] = empty.map((c) => ({
      cell: c,
      digit: [0, 0],
      notes: [this.notes[c]!, remove ? this.notes[c]! & ~b : this.notes[c]! | b],
    }));
    this.commit("notes", changes);
    this.emit({ type: "notes", cells: empty });
    this.emit({ type: "note", cell: empty[0]!, digit, on: !remove });
  }

  /** Candidates as a player would pencil them: sudoku rules (plus cage sums in killer). */
  candidatesNow(): Uint16Array {
    return this.kind === "killer" ? comboCandidates(this.puzzle, this.grid) : basicCandidates(this.puzzle, this.grid);
  }

  /** Fill every empty cell's notes with its candidates. */
  autoNotes(): void {
    if (this.solved) return;
    const cand = this.candidatesNow();
    const changes: Change[] = [];
    for (let c = 0; c < 81; c++)
      if (!this.grid[c]) changes.push({ cell: c, digit: [0, 0], notes: [this.notes[c]!, cand[c]!] });
    this.commit("auto-notes", changes);
    this.emit({ type: "notes", cells: changes.map((ch) => ch.cell) });
  }

  clearNotes(): void {
    const changes: Change[] = [];
    for (let c = 0; c < 81; c++) if (this.notes[c]) changes.push({ cell: c, digit: [this.grid[c]!, this.grid[c]!], notes: [this.notes[c]!, 0] });
    this.commit("clear-notes", changes);
    this.emit({ type: "notes", cells: changes.map((ch) => ch.cell) });
  }

  undo(): void {
    const e = this.undoStack.pop();
    if (!e) return;
    for (const ch of e.changes) {
      this.grid[ch.cell] = ch.digit[0];
      this.notes[ch.cell] = ch.notes[0];
    }
    this.redoStack.push(e);
    this.solved = false;
    this.emit({ type: "history", kind: "undo", cells: e.changes.map((c) => c.cell) });
  }

  redo(): void {
    const e = this.redoStack.pop();
    if (!e) return;
    for (const ch of e.changes) {
      this.grid[ch.cell] = ch.digit[1];
      this.notes[ch.cell] = ch.notes[1];
    }
    this.undoStack.push(e);
    this.emit({ type: "history", kind: "redo", cells: e.changes.map((c) => c.cell) });
    this.checkSolved();
  }

  // ------------------------------------------------------------------------------------------
  // Completion

  private checkCompletion(cell: CellId): void {
    const ok = (c: CellId) => this.grid[c] !== 0 && this.grid[c] === this.solution[c];
    const houses = CELL_HOUSES[cell]!.filter((h) => HOUSE_CELLS[h]!.every(ok)).map(houseAt);
    const cage = this.cageOf(cell);
    const cages = cage && cage.cells.length > 1 && cage.cells.every(ok) ? [cage.id] : [];
    const d = this.grid[cell]!;
    const digits = this.digitCounts()[d] === 9 ? [d] : [];
    if (houses.length || cages.length || digits.length) this.emit({ type: "complete", cell, houses, cages, digits });
    this.checkSolved();
  }

  private checkSolved(): void {
    if (this.solved) return;
    for (let c = 0; c < 81; c++) if (this.grid[c] !== this.solution[c]) return;
    this.solved = true;
    this.emit({ type: "solved" });
  }

  // ------------------------------------------------------------------------------------------
  // Hints

  hint(): SudokuHint {
    return sudokuHint({ puzzle: this.puzzle, grid: this.grid, notes: this.notes, solution: this.solution });
  }

  recordRung(rung: number): void {
    if (rung >= 0 && rung < this.rungs.length) this.rungs[rung]!++;
  }

  /** Apply a hint's "do" rung as one undoable entry. */
  applyHint(h: SudokuHint): void {
    if (this.solved) return;
    this.hintsUsed++;
    const pending = new Map<CellId, Change>();
    const get = (c: CellId): Change => {
      let ch = pending.get(c);
      if (!ch) pending.set(c, (ch = { cell: c, digit: [this.grid[c]!, this.grid[c]!], notes: [this.notes[c]!, this.notes[c]!] }));
      return ch;
    };
    const placed: { cell: CellId; digit: Digit }[] = [];
    if (h.kind === "step" && h.step) {
      if (h.step.eliminations.length) {
        const cand = createState(this.puzzle, this.grid, this.notes).cand;
        for (const e of h.step.eliminations) {
          const ch = get(e.cell);
          if (!ch.notes[1]) ch.notes[1] = cand[e.cell]!;
          ch.notes[1] &= ~bit(e.digit);
        }
      }
      for (const p of h.step.placements) placed.push(p);
    } else if (h.fix) {
      for (const c of h.fix.clear ?? []) {
        const ch = get(c);
        ch.digit[1] = 0;
      }
      if (h.fix.resetNotes?.length) {
        const cand = this.candidatesNow();
        for (const c of h.fix.resetNotes) get(c).notes[1] = cand[c]!;
      }
      for (const r of h.fix.reveal ?? []) placed.push(r);
    }
    for (const p of placed) this.placeChanges(p.cell, p.digit, pending);
    this.commit("hint", [...pending.values()]);
    const cleared = h.fix?.clear ?? [];
    if (cleared.length) this.emit({ type: "erase", cells: cleared });
    const noteCells = [...pending.values()].filter((ch) => ch.notes[0] !== ch.notes[1] && !placed.some((p) => p.cell === ch.cell)).map((ch) => ch.cell);
    if (noteCells.length) this.emit({ type: "notes", cells: noteCells });
    for (const p of placed) {
      this.emit({ type: "place", cell: p.cell, digit: p.digit, correct: true, fromHint: true });
      this.checkCompletion(p.cell);
    }
  }

  // ------------------------------------------------------------------------------------------

  toJSON(): SavedSudoku {
    return {
      v: 1,
      puzzleId: this.puzzle.id,
      grid: Array.from(this.grid),
      notes: Array.from(this.notes),
      elapsed: Math.round(this.elapsedMs),
      mistakes: this.mistakes,
      hints: this.hintsUsed,
      rungs: [...this.rungs],
      solved: this.solved,
    };
  }
}
