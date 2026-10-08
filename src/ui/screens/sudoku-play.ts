/**
 * Classic / killer play screen. Wires the game model to the board, numpad, hint ladder and the
 * Tetris-Effect-style feedback: every placement plays a note and sparks in its digit's colour,
 * completions sweep light across the house with a callout, and solving sets off the finale.
 */
import { digitsOf } from "../../engine/combos";
import { comboText } from "../../engine/hints/format";
import { boxOf, CELL_HOUSES, cellName, colOf, HOUSE_CELLS, houseCells, houseIndex, houseName, rowOf } from "../../engine/geometry";
import type { SudokuHint } from "../../engine/hints/index";
import { decodeSudoku, encodeSudoku } from "../../engine/pack";
import { regionEquation, type RegionEquation } from "../../engine/region";
import { createState } from "../../engine/state";
import { cageView } from "../../engine/techniques/killer";
import type { CellId, Difficulty, House, Puzzle } from "../../engine/types";
import { loadSudokuPack, pickNext } from "../../game/packs";
import { SudokuGame, type GameEvent, type SavedSudoku } from "../../game/sudoku-game";
import { clearSaved, loadSaved, storeSaved, type App, type Screen } from "../app";
import { refNodes } from "../cell-refs";
import { HintSheet } from "../components/hint-sheet";
import { Numpad } from "../components/numpad";
import { SudokuBoard } from "../components/sudoku-board";
import { clearToast, toast } from "../components/toast";
import { flip, formatTime, h, svgIcon } from "../dom";
import { callout } from "../fx/callout";
import { buzz } from "../haptics";
import { ICONS } from "../icons";
import { DIFFICULTY_LABEL, MODE_LABEL, mistakeText } from "../messages";
import { DIGIT_COLORS, MARK_COLORS } from "../palette";
import { onSettings, settings } from "../settings";
import { sound } from "../sound";
import { firstTime, loadProgress, recordHint, recordSolve } from "../store";
import { openLearn } from "./learn";
import { openSettings } from "./settings-sheet";
import { showWin } from "./win";

type SudokuMode = "classic" | "killer";

export async function createSudokuPlay(app: App, mode: SudokuMode, difficulty: Difficulty, resume: boolean, avoid?: string): Promise<Screen> {
  let puzzle: Puzzle | null = null;
  let savedState: SavedSudoku | null = null;
  if (resume) {
    const saved = loadSaved<SavedSudoku>(mode);
    if (saved) {
      puzzle = decodeSudoku(saved.entry as ReturnType<typeof encodeSudoku>);
      savedState = saved.state;
      difficulty = saved.difficulty;
    }
  }
  if (!puzzle) {
    const pack = await loadSudokuPack(mode, difficulty);
    puzzle = pickNext(pack, loadProgress().solved[`${mode}-${difficulty}`] ?? [], avoid);
    if (!puzzle) throw new Error("empty pack");
  }
  return new SudokuPlay(app, mode, difficulty, puzzle, savedState);
}

class SudokuPlay implements Screen {
  readonly el: HTMLElement;
  private game: SudokuGame;
  private board: SudokuBoard;
  private numpad: Numpad;
  private sheet: HintSheet;
  private hint: SudokuHint | null = null;
  private selected: CellId | null = null;
  /** Cells selected by dragging; digit taps pencil into all of them. */
  private multi: CellId[] = [];
  private activeDigit = 0;
  private notesMode = false;
  private timerEl: HTMLElement;
  private progressEl: HTMLElement;
  private statsEl: HTMLElement;
  private cageBar: HTMLElement | null = null;
  private tools: Record<string, HTMLButtonElement> = {};
  private tick = 0;
  private saveTimer = 0;
  private offs: (() => void)[] = [];
  private lastPlaced: CellId = 40;
  /** Set when this game is being thrown away (restart): skip the final save. */
  private discard = false;
  /** Killer 45-rule lens: which house of the selected cell to analyse, or off. */
  private lensKind: "row" | "col" | "box" | null = null;

  constructor(
    private app: App,
    private mode: SudokuMode,
    private difficulty: Difficulty,
    private puzzle: Puzzle,
    saved: SavedSudoku | null,
  ) {
    this.game = new SudokuGame(puzzle, saved);
    this.applyGameSettings();
    this.board = new SudokuBoard(
      puzzle,
      (c, e) => this.onCell(c, e),
      (cells) => this.onDragSelect(cells),
    );
    this.numpad = new Numpad({ onDigit: (d) => this.onDigit(d), onNote: (d) => this.onDigit(d, true) });
    this.sheet = new HintSheet({
      onRung: (r) => this.onRung(r),
      onApply: () => this.applyHint(),
      onLearn: (id) => openLearn(id),
      onClose: () => this.closeHint(),
      refColors: (texts) => this.board.refColors(texts),
      onRef: (name) => this.board.flashRef(name),
    });

    this.timerEl = h("div", { class: "timer", "data-testid": "timer" });
    this.progressEl = h("i");
    this.statsEl = h("div", { class: "stats" });
    const title = h("div", { class: "title" }, h("b", null, MODE_LABEL[mode]!), h("span", null, DIFFICULTY_LABEL[difficulty]!));
    const topbar = h(
      "header",
      { class: "topbar" },
      h("button", { class: "icon-btn", type: "button", "aria-label": "Back to menu", "data-testid": "back", onclick: () => void this.app.home() }, svgIcon(ICONS.back)),
      title,
      this.timerEl,
      h("button", { class: "icon-btn", type: "button", "aria-label": "Menu", onclick: () => this.openMenu() }, svgIcon(ICONS.menu)),
    );

    const tool = (key: string, icon: string, label: string, onclick: () => void, extra = "") => {
      const b = h("button", { class: `tool ${extra}`, type: "button", "aria-label": label, "data-testid": `tool-${key}`, onclick }, svgIcon(icon), h("span", null, label)) as HTMLButtonElement;
      this.tools[key] = b;
      return b;
    };
    const toolbar = h(
      "div",
      { class: "tools" },
      tool("undo", ICONS.undo, "Undo", () => this.game.undo()),
      tool("erase", ICONS.erase, "Erase", () => this.erase()),
      tool("notes", ICONS.pencil, "Notes", () => this.toggleNotes()),
      tool("auto", ICONS.wand, "Auto notes", () => this.autoNotes()),
      tool("hint", ICONS.bulb, "Hint", () => this.openHint(), "hint-tool"),
    );

    if (mode === "killer") this.cageBar = h("div", { class: "cage-bar", "aria-live": "polite" });

    this.el = h(
      "main",
      { class: `screen play sudoku mode-${mode}`, "data-testid": "play" },
      topbar,
      h("div", { class: "progress" }, this.progressEl),
      this.statsEl,
      h("div", { class: "board-area" }, this.board.el),
      this.cageBar,
      toolbar,
      this.numpad.el,
      this.sheet.el,
    );

    this.offs.push(this.game.on((e) => this.onEvent(e)));
    this.offs.push(onSettings(() => {
      this.applyGameSettings();
      this.render();
    }));
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    addEventListener("keydown", onKey);
    this.offs.push(() => removeEventListener("keydown", onKey));
    const onVis = () => this.save();
    document.addEventListener("visibilitychange", onVis);
    this.offs.push(() => document.removeEventListener("visibilitychange", onVis));

    this.tick = window.setInterval(() => this.onTick(), 1000);
    this.render();
    this.save();
    sound.startMusic();
    requestAnimationFrame(() => this.introSweep());
    if (firstTime(`tip-${mode}`))
      setTimeout(
        () =>
          // Skipped if they've already found Hint: the open sheet would sit under it.
          !this.sheet.isOpen &&
          toast(
            mode === "killer"
              ? "Each dashed cage adds up to its number. Stuck? Tap Hint: every tap reveals a little more, and Σ45 works out a house for you."
              : "Stuck? Tap Hint: first it says where to look, then the technique, then why it works.",
            "info",
            6500,
            true,
          ),
        900,
      );
  }

  destroy(): void {
    this.save();
    clearInterval(this.tick);
    for (const off of this.offs) off();
  }

  // ------------------------------------------------------------------------------------------

  private applyGameSettings(): void {
    const st = settings();
    this.game.settings.autoClearNotes = st.autoClearNotes;
    this.game.settings.checkMistakes = st.checkMistakes;
  }

  private progress(): number {
    return this.game.filledCount() / 81;
  }

  private render(): void {
    const st = settings();
    const g = this.game;
    const selDigit = this.selected !== null ? g.grid[this.selected]! : 0;
    this.board.render({
      grid: g.grid,
      notes: g.notes,
      given: g.given,
      solution: g.solution,
      selected: this.selected,
      multi: this.multi,
      highlightDigit: st.highlightSame ? selDigit || this.activeDigit : 0,
      showWrong: st.checkMistakes,
      cageTint: st.cageTint,
    });
    const counts = g.digitCounts();
    this.numpad.update(counts.map((n) => 9 - n), this.notesMode, this.activeDigit);
    this.tools.undo!.disabled = !g.canUndo();
    this.tools.notes!.classList.toggle("on", this.notesMode);
    this.tools.notes!.setAttribute("aria-pressed", String(this.notesMode));
    this.tools.notes!.querySelector("span")!.textContent = this.notesMode ? "Notes on" : "Notes";
    this.el.classList.toggle("notes-mode", this.notesMode);
    const p = this.progress();
    this.progressEl.style.width = `${(p * 100).toFixed(1)}%`;
    this.timerEl.textContent = st.showTimer ? formatTime(g.elapsedMs) : "";
    this.statsEl.replaceChildren(
      h("span", { class: g.mistakes ? "bad" : "" }, `Mistakes ${g.mistakes}`),
      h("span", null, `Hints ${g.hintsUsed}`),
      this.multi.length > 1
        ? h("span", { class: "notes-flag" }, `${this.multi.length} cells · digits pencil into all`)
        : this.notesMode
          ? h("span", { class: "notes-flag" }, "✎ Pencil mode")
          : h("span", { class: "dim" }, `${Math.round(p * 100)}%`),
    );
    this.renderCageBar();
    this.app.bg.setIntensity(0.15 + p * 0.85);
    sound.setIntensity(p);
  }

  private renderCageBar(): void {
    if (!this.cageBar) return;
    if (this.lensKind) return this.renderLens();
    this.cageBar.classList.remove("lens-mode");
    this.board.setLens(null);
    const st = settings();
    const lensBtn = h("button", { class: "lens-btn", type: "button", "aria-label": "45 rule lens", "data-testid": "lens", onclick: () => this.setLens("row") }, "Σ45");
    const cage = this.selected !== null ? this.game.cageOf(this.selected) : undefined;
    if (!cage || !st.showCombos) {
      this.cageBar.replaceChildren(lensBtn, h("span", { class: "dim" }, cage ? `Cage ${cage.sum} · ${cage.cells.length} cells` : "Select a cell to see its cage"));
      return;
    }
    const s = createState(this.puzzle, this.game.grid, null);
    const v = cageView(s, cage);
    // Strike combos clashing with digits placed in a house the whole cage lies in.
    const shared = CELL_HOUSES[cage.cells[0]!]!.filter((hh) => cage.cells.every((c) => CELL_HOUSES[c]!.includes(hh)));
    let blocked = 0;
    for (const hh of shared) for (const c of HOUSE_CELLS[hh]!) if (!cage.cells.includes(c) && this.game.grid[c]) blocked |= 1 << this.game.grid[c]!;
    const chips = v.combos.map((m) => h("span", { class: `combo${m & blocked ? " out" : ""}` }, comboText(m)));
    const must = v.combos.filter((m) => !(m & blocked)).reduce((a, m) => a & m, 0x3fe);
    const parts: HTMLElement[] = [
      lensBtn,
      h("b", null, `${cage.sum}`),
      h(
        "span",
        { class: "dim" },
        !v.empty.length ? "cage complete" : v.empty.length === cage.cells.length ? `in ${cage.cells.length} cells` : `${v.rem} left in ${v.empty.length}`,
      ),
      ...chips.slice(0, 12),
    ];
    if (chips.length > 12) parts.push(h("span", { class: "dim" }, `+${chips.length - 12}`));
    if (v.empty.length && digitsOf(must).length && v.combos.length > 1) parts.push(h("span", { class: "must" }, `needs ${digitsOf(must).join(",")}`));
    this.cageBar.replaceChildren(...parts);
  }

  private setLens(kind: "row" | "col" | "box" | null): void {
    this.lensKind = kind;
    sound.ui("toggle");
    this.render();
  }

  /** The 45 rule for the selected cell's row, column or box, worked out on the board. */
  private renderLens(): void {
    const c = this.selected ?? 40;
    const kind = this.lensKind!;
    const house = { kind, index: kind === "row" ? rowOf(c) : kind === "col" ? colOf(c) : boxOf(c) };
    const eq = regionEquation(this.puzzle.cages, this.game.grid, [house]);
    const readable = eq && eq.empty.length <= LENS_MAX;
    // Innies and outies are named in the colour of their rings on the board.
    const lensColors = new Map(readable ? eq.empty.map((x) => [cellName(x), eq.side === "innies" ? LENS_IN : LENS_OUT] as const) : []);
    const chip = (k: "row" | "col" | "box", label: string) =>
      h("button", { class: `lens-chip${k === kind ? " active" : ""}`, type: "button", onclick: () => this.setLens(k) }, label);
    this.cageBar!.classList.add("lens-mode");
    this.cageBar!.replaceChildren(
      h("button", { class: "lens-btn on", type: "button", "aria-label": "Close 45 lens", "data-testid": "lens", onclick: () => this.setLens(null) }, "Σ45 ✕"),
      chip("row", `Row ${rowOf(c) + 1}`),
      chip("col", `Col ${colOf(c) + 1}`),
      chip("box", `Box ${boxOf(c) + 1}`),
      h("span", { class: "lens-eq", "data-testid": "lens-eq" }, ...refNodes(lensText(eq, houseName(house)), lensColors)),
    );
    this.board.setLens({
      region: houseCells(house),
      innies: readable && eq.side === "innies" ? eq.empty : [],
      outies: readable && eq.side === "outies" ? eq.empty : [],
    });
  }

  // ------------------------------------------------------------------------------------------
  // Input

  private onDragSelect(cells: CellId[]): void {
    this.multi = cells;
    this.selected = cells[cells.length - 1]!;
    sound.ui("select");
    this.render();
  }

  private onCell(c: CellId, e: PointerEvent): void {
    e.preventDefault();
    sound.unlock();
    this.multi = [];
    if (this.selected === c && this.activeDigit && !this.game.given[c] && !this.game.grid[c]) {
      this.onDigit(this.activeDigit);
      return;
    }
    this.selected = c;
    sound.ui("select");
    this.render();
  }

  private onDigit(d: number, asNote = false): void {
    sound.unlock();
    const c = this.selected;
    if (c === null || this.game.given[c]) {
      this.activeDigit = this.activeDigit === d ? 0 : d;
      sound.ui("tap");
      this.render();
      return;
    }
    if (this.sheet.isOpen) this.closeHint();
    if (this.multi.length > 1) {
      this.game.toggleNoteMany(this.multi, d);
      this.activeDigit = d;
      this.render();
      return;
    }
    if (asNote || this.notesMode) {
      if (this.game.grid[c]) return;
      this.game.toggleNote(c, d);
      if (asNote) buzz("note");
    } else this.game.place(c, d);
    this.activeDigit = d;
    this.render();
  }

  private erase(): void {
    if (this.selected === null) return;
    this.game.erase(this.selected);
  }

  private toggleNotes(): void {
    this.notesMode = !this.notesMode;
    if (this.notesMode) sound.note(5, true);
    else sound.ui("toggle");
    buzz("note");
    this.render();
  }

  private autoNotes(): void {
    this.game.autoNotes();
    sound.ui("toggle");
    toast(this.mode === "killer" ? "Notes filled in — cage sums applied." : "Notes filled with every possible digit.");
  }

  private onKey(e: KeyboardEvent): void {
    if (document.querySelector(".overlay")) return;
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) this.game.redo();
      else this.game.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "y") {
      e.preventDefault();
      this.game.redo();
      return;
    }
    if (/^[1-9]$/.test(k)) return this.onDigit(Number(k), e.shiftKey || e.altKey);
    if (k === "Backspace" || k === "Delete" || k === "0") {
      e.preventDefault();
      return this.erase();
    }
    if (k === "n" || k === "N") return this.toggleNotes();
    if (k === "h" || k === "H") return this.sheet.isOpen ? this.sheet.advance() : this.openHint();
    if (k === "Escape" && this.sheet.isOpen) return this.closeHint();
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const mv = moves[k];
    if (mv) {
      e.preventDefault();
      const c = this.selected ?? 40;
      const r = (rowOf(c) + mv[0] + 9) % 9;
      const col = (colOf(c) + mv[1] + 9) % 9;
      this.selected = r * 9 + col;
      this.render();
    }
  }

  // ------------------------------------------------------------------------------------------
  // Game events → light and sound

  private onEvent(e: GameEvent): void {
    const fx = this.app.fx;
    switch (e.type) {
      case "place": {
        const p = this.board.center(e.cell);
        const color = DIGIT_COLORS[e.digit]!;
        const pan = (colOf(e.cell) - 4) / 4;
        this.lastPlaced = e.cell;
        if (e.correct || !settings().checkMistakes) {
          this.board.pop(e.cell);
          fx.burst(p.x, p.y, color, { count: e.fromHint ? 14 : 18, speed: 200, size: 8 });
          fx.ring(p.x, p.y, color, this.board.cellSize() * 0.9, 0.5, 2);
          this.app.bg.pulse(p.x, p.y, color, 0.5);
          sound.place(e.digit, { pan });
          buzz("place");
        } else {
          this.board.shake(e.cell);
          fx.burst(p.x, p.y, "#ff4d6d", { count: 10, speed: 140, size: 6, life: 0.5 });
          sound.mistake();
          buzz("mistake");
          toast(mistakeText(e.reason, e.digit), "bad");
        }
        break;
      }
      case "note":
        sound.note(e.digit, e.on);
        break;
      case "erase":
        sound.erase();
        break;
      case "complete":
        this.celebrate(e.cell, e.houses, e.cages, e.digits);
        break;
      case "solved":
        this.finale();
        break;
      default:
        break;
    }
    this.render();
    this.scheduleSave();
  }

  private celebrate(cell: CellId, houses: House[], cages: number[], digits: number[]): void {
    const fx = this.app.fx;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--a1").trim() || "#7cf3ff";
    const digitColor = DIGIT_COLORS[this.game.grid[cell]!]!;
    const kinds: string[] = [];
    const names: string[] = [];
    for (const hs of houses) {
      const cells = [...HOUSE_CELLS[houseIndex(hs)]!].sort((a, b) => dist(a, cell) - dist(b, cell));
      this.board.sweep(cells);
      const first = this.board.center(HOUSE_CELLS[houseIndex(hs)]![0]!);
      const last = this.board.center(HOUSE_CELLS[houseIndex(hs)]![8]!);
      if (hs.kind === "box") {
        const mid = this.board.center(HOUSE_CELLS[houseIndex(hs)]![4]!);
        fx.ring(mid.x, mid.y, accent, this.board.cellSize() * 2.6, 0.9, 4);
        fx.burst(mid.x, mid.y, digitColor, { count: 26, speed: 260 });
      } else {
        fx.beam(first.x, first.y, last.x, last.y, accent, this.board.cellSize() * 0.9, 0.9);
        fx.streak(first.x, first.y, last.x, last.y, digitColor, 30);
      }
      kinds.push(hs.kind);
      names.push(hs.kind === "row" ? `ROW ${hs.index + 1}` : hs.kind === "col" ? `COLUMN ${hs.index + 1}` : "BOX");
    }
    for (const id of cages) {
      this.board.litCage(id);
      const cage = this.puzzle.cages.find((c) => c.id === id)!;
      for (const c of cage.cells) {
        const p = this.board.center(c);
        fx.burst(p.x, p.y, accent, { count: 6, speed: 120, size: 6 });
      }
      kinds.push("cage");
      names.push(`CAGE ${cage.sum}`);
    }
    for (const d of digits) {
      const cells: CellId[] = [];
      for (let c = 0; c < 81; c++) if (this.game.grid[c] === d) cells.push(c);
      this.board.sweep(cells.sort((a, b) => dist(a, cell) - dist(b, cell)), 60);
      for (const c of cells) {
        const p = this.board.center(c);
        fx.ring(p.x, p.y, DIGIT_COLORS[d]!, this.board.cellSize() * 0.8, 0.6, 2);
      }
      kinds.push("digit");
      names.push(`ALL ${d}s`);
    }
    const total = kinds.length;
    const boardBox = this.board.el.getBoundingClientRect();
    const y = boardBox.top + boardBox.height * 0.42;
    if (total >= 2) {
      const word = ["", "", "DOUBLE", "TRIPLE", "QUAD", "PENTA"][Math.min(total, 5)]!;
      callout(word, { sub: names.join(" · "), size: "big", color: digitColor, y });
      this.board.punch();
      buzz("multi");
    } else {
      callout(names[0]!, { size: "small", color: kinds[0] === "digit" ? digitColor : accent, y });
      buzz("complete");
    }
    const p = this.board.center(cell);
    this.app.bg.pulse(p.x, p.y, digitColor, 1 + total * 0.5);
    sound.complete(kinds);
  }

  private finale(): void {
    const g = this.game;
    this.el.dataset.solved = "true";
    const fx = this.app.fx;
    this.closeHint();
    this.board.wave(this.lastPlaced);
    const picks = [40, 0, 8, 72, 80, 20, 60].map((c) => ({ ...this.board.center(c), color: DIGIT_COLORS[g.grid[c]!]! }));
    setTimeout(() => fx.fireworks(picks), 250);
    const perfect = g.mistakes === 0 && g.hintsUsed === 0;
    const box = this.board.el.getBoundingClientRect();
    setTimeout(() => callout(perfect ? "PERFECT" : "SOLVED", { size: "huge", sub: formatTime(g.elapsedMs), y: box.top + box.height * 0.4 }), 350);
    const c = this.board.center(40);
    this.app.bg.pulse(c.x, c.y, "#ffffff", 2.5);
    sound.solved();
    buzz("solved");
    recordSolve(this.mode, this.difficulty, this.puzzle.id, g.elapsedMs);
    clearSaved(this.mode);
    setTimeout(
      () =>
        showWin(this.el, {
          mode: this.mode,
          difficulty: this.difficulty,
          perfect,
          time: g.elapsedMs,
          mistakes: g.mistakes,
          hints: g.hintsUsed,
          techniques: this.puzzle.meta?.techniques ?? [],
          onNext: () => void this.app.play(this.mode, this.difficulty, false, this.puzzle.id),
          onHome: () => void this.app.home(),
        }),
      2300,
    );
  }

  /** Opening flourish: the givens shimmer in. */
  private introSweep(): void {
    if (settings().effects === "low") return;
    const order = Array.from({ length: 81 }, (_, i) => i).filter((c) => this.game.grid[c]).sort((a, b) => rowOf(a) + colOf(a) - (rowOf(b) + colOf(b)));
    this.board.sweep(order, 12);
  }

  // ------------------------------------------------------------------------------------------
  // Hints

  private openHint(): void {
    sound.unlock();
    if (this.game.solved) return;
    if (this.sheet.isOpen) {
      this.sheet.advance();
      return;
    }
    this.hint = this.game.hint();
    clearToast();
    flip(this.board.el, () => this.el.classList.add("hint-open"));
    this.sheet.open(this.hint);
  }

  private onRung(r: number): void {
    const hint = this.hint;
    if (!hint) return;
    this.game.recordRung(hint.kind === "step" ? r : 0);
    const cand = createState(this.puzzle, this.game.grid, this.game.notes).cand;
    this.board.showHint(hint, r, cand);
    sound.hint(r);
    if (r === 3 && hint.step?.links?.length) {
      for (const l of hint.step.links.slice(0, 6)) {
        const p = this.board.center(l.from.cell);
        this.app.fx.ring(p.x, p.y, MARK_COLORS.on!, this.board.cellSize() * 0.6, 0.6, 2);
      }
    }
    // Select the main cell so the player's eye lands on it.
    if (r >= 2 && hint.step?.placements[0]) this.selected = hint.step.placements[0].cell;
    this.render();
  }

  private applyHint(): void {
    const hint = this.hint;
    if (!hint) return;
    if (hint.technique) recordHint(hint.technique);
    this.closeHint();
    this.game.applyHint(hint);
    if (hint.step && !hint.step.placements.length) {
      for (const e of hint.step.eliminations) {
        const p = this.board.center(e.cell);
        this.app.fx.burst(p.x, p.y, MARK_COLORS.elim!, { count: 5, speed: 90, size: 5, life: 0.5 });
      }
      toast(`${hint.title}: ${hint.ladder.do}`, "good");
    }
  }

  private closeHint(): void {
    this.sheet.close();
    this.hint = null;
    flip(this.board.el, () => this.el.classList.remove("hint-open"));
    this.board.showHint(null, 0, null);
  }

  // ------------------------------------------------------------------------------------------

  private onTick(): void {
    if (document.hidden || this.game.solved || document.querySelector(".overlay")) return;
    this.game.elapsedMs += 1000;
    if (settings().showTimer) this.timerEl.textContent = formatTime(this.game.elapsedMs);
    if (Math.round(this.game.elapsedMs / 1000) % 5 === 0) this.save();
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.save(), 250);
  }

  private save(): void {
    if (this.game.solved || this.discard) return;
    storeSaved(this.mode, { difficulty: this.difficulty, entry: encodeSudoku(this.puzzle), state: this.game.toJSON() });
  }

  private openMenu(): void {
    const close = () => menu.remove();
    const item = (label: string, icon: string, fn: () => void) =>
      h("button", { class: "menu-item", type: "button", onclick: () => (close(), fn()) }, svgIcon(icon), label);
    const menu = h(
      "div",
      { class: "overlay menu", role: "dialog", "aria-label": "Game menu", onclick: (e: Event) => e.target === menu && close() },
      h(
        "div",
        { class: "menu-panel" },
        item("New puzzle", ICONS.next, () => void this.app.play(this.mode, this.difficulty, false, this.puzzle.id)),
        item("Restart this puzzle", ICONS.restart, () => {
          this.discard = true;
          storeSaved(this.mode, { difficulty: this.difficulty, entry: encodeSudoku(this.puzzle), state: new SudokuGame(this.puzzle).toJSON() });
          void this.app.play(this.mode, this.difficulty, true);
        }),
        item("Fill notes", ICONS.wand, () => this.autoNotes()),
        item("Clear notes", ICONS.trash, () => this.game.clearNotes()),
        item("Learn techniques", ICONS.book, () => openLearn()),
        item("Settings", ICONS.gear, () => openSettings()),
      ),
    );
    document.body.append(menu);
  }
}

/** Most open cells the lens will treat as a readable sum. */
const LENS_MAX = 4;
/** The lens's ring colours for innies and outies (style.css .lens-in / .lens-out). */
const LENS_IN = "#46d9ff";
const LENS_OUT = "#ff7ad9";

function lensText(eq: RegionEquation | null, region: string): string {
  if (!eq) return `Every cage fits inside ${region} — nothing pokes out.`;
  if (eq.empty.length > LENS_MAX)
    return `${eq.empty.length} open cells poke out of ${region} — too many to pin down. Try another house.`;
  const a = eq.analysis;
  const names = eq.empty.map(cellName).join(" + ");
  const placed = eq.placed.reduce((s, p) => s + p.digit, 0);
  const minusPlaced = placed ? ` − ${placed} placed` : "";
  if (eq.side === "innies") {
    if (!eq.empty.length) return `45 − (${a.inside.map((c) => c.sum).join("+")}) = ${a.innieSum}: the innies are all placed.`;
    return `45 − (${a.inside.map((c) => c.sum).join("+")})${minusPlaced} = ${eq.target}, so ${names} = ${eq.target}.`;
  }
  const crossing = a.partial.reduce((s, p) => s + p.cage.sum, 0);
  return `Cages crossing out total ${crossing}: ${a.insideSum} + ${crossing} − 45${minusPlaced} = ${eq.target}, so ${names} = ${eq.target}.`;
}

const dist = (a: CellId, b: CellId) => Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b));
