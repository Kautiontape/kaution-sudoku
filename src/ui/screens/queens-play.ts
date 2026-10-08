/** Queens play screen: the board, tools, hint ladder and crown-burst feedback. */
import { attacks, colOf, rowOf } from "../../engine/queens/geometry";
import type { QueensHint, RegionNamer } from "../../engine/queens/hints";
import { decodeQueens, encodeQueens, type QueensPackEntry } from "../../engine/queens/pack";
import { QUEEN, type QCell, type QueensPuzzle } from "../../engine/queens/types";
import type { Difficulty } from "../../engine/types";
import { loadQueensPack, pickNext } from "../../game/packs";
import { QueensGame, type QueensEvent, type SavedQueens } from "../../game/queens-game";
import { clearSaved, loadSaved, storeSaved, type App, type Screen } from "../app";
import { HintSheet } from "../components/hint-sheet";
import { QueensBoard } from "../components/queens-board";
import { toast } from "../components/toast";
import { formatTime, h, svgIcon } from "../dom";
import { callout } from "../fx/callout";
import { buzz } from "../haptics";
import { ICONS } from "../icons";
import { DIFFICULTY_LABEL } from "../messages";
import { REGION_COLORS } from "../palette";
import { onSettings, settings, updateSettings } from "../settings";
import { sound } from "../sound";
import { loadProgress, recordHint, recordSolve } from "../store";
import { openLearn } from "./learn";
import { openSettings } from "./settings-sheet";
import { showWin } from "./win";

const NAMES: RegionNamer = { region: (i) => REGION_COLORS[i % REGION_COLORS.length]!.name };

export async function createQueensPlay(app: App, difficulty: Difficulty, resume: boolean, avoid?: string): Promise<Screen> {
  let puzzle: QueensPuzzle | null = null;
  let saved: SavedQueens | null = null;
  if (resume) {
    const s = loadSaved<SavedQueens>("queens");
    if (s) {
      puzzle = decodeQueens(s.entry as QueensPackEntry);
      saved = s.state;
      difficulty = s.difficulty;
    }
  }
  if (!puzzle) {
    const pack = await loadQueensPack(difficulty);
    puzzle = pickNext(pack, loadProgress().solved[`queens-${difficulty}`] ?? [], avoid);
    if (!puzzle) throw new Error("empty pack");
  }
  return new QueensPlay(app, difficulty, puzzle, saved);
}

class QueensPlay implements Screen {
  readonly el: HTMLElement;
  private game: QueensGame;
  private board: QueensBoard;
  private sheet: HintSheet;
  private hint: QueensHint | null = null;
  private timerEl: HTMLElement;
  private progressEl: HTMLElement;
  private statsEl: HTMLElement;
  private autoBtn: HTMLButtonElement;
  private undoBtn: HTMLButtonElement;
  private tick = 0;
  private offs: (() => void)[] = [];
  private discard = false;
  private last: QCell = 0;

  constructor(
    private app: App,
    private difficulty: Difficulty,
    private puzzle: QueensPuzzle,
    saved: SavedQueens | null,
  ) {
    this.game = new QueensGame(puzzle, saved);
    this.game.settings.checkMistakes = settings().checkMistakes;
    this.board = new QueensBoard(puzzle, {
      onTap: (c) => this.tap(c),
      onLong: (c) => this.long(c),
      onDrag: (cells) => this.drag(cells),
    });
    this.sheet = new HintSheet({
      onRung: (r) => this.onRung(r),
      onApply: () => this.applyHint(),
      onLearn: (id) => openLearn(id),
      onClose: () => this.closeHint(),
    });
    this.timerEl = h("div", { class: "timer" });
    this.progressEl = h("i");
    this.statsEl = h("div", { class: "stats" });
    const btn = (key: string, icon: string, label: string, onclick: () => void, extra = "") =>
      h("button", { class: `tool ${extra}`, type: "button", "aria-label": label, "data-testid": `tool-${key}`, onclick }, svgIcon(icon), h("span", null, label)) as HTMLButtonElement;
    this.undoBtn = btn("undo", ICONS.undo, "Undo", () => this.game.undo());
    this.autoBtn = btn("autox", ICONS.cross, "Auto ✕", () => {
      updateSettings({ autoCross: !settings().autoCross });
      sound.ui("toggle");
    });
    this.el = h(
      "main",
      { class: "screen play queens", "data-testid": "play" },
      h(
        "header",
        { class: "topbar" },
        h("button", { class: "icon-btn", type: "button", "aria-label": "Back to menu", "data-testid": "back", onclick: () => void this.app.home() }, svgIcon(ICONS.back)),
        h("div", { class: "title" }, h("b", null, "Queens"), h("span", null, `${DIFFICULTY_LABEL[difficulty]} · ${puzzle.n}×${puzzle.n}`)),
        this.timerEl,
        h("button", { class: "icon-btn", type: "button", "aria-label": "Menu", onclick: () => this.openMenu() }, svgIcon(ICONS.menu)),
      ),
      h("div", { class: "progress" }, this.progressEl),
      this.statsEl,
      h("div", { class: "board-area" }, this.board.el),
      h("p", { class: "qhelp" }, "Tap for ✕, tap again for a queen · hold for a queen · drag to ✕ many"),
      h(
        "div",
        { class: "tools" },
        this.undoBtn,
        btn("clear", ICONS.trash, "Clear", () => this.game.clearAll()),
        this.autoBtn,
        btn("hint", ICONS.bulb, "Hint", () => this.openHint(), "hint-tool"),
      ),
      this.sheet.el,
    );
    this.offs.push(this.game.on((e) => this.onEvent(e)));
    this.offs.push(onSettings(() => {
      this.game.settings.checkMistakes = settings().checkMistakes;
      this.render();
    }));
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector(".overlay")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) this.game.redo();
        else this.game.undo();
      } else if (e.key === "h" || e.key === "H") this.sheet.isOpen ? this.sheet.advance() : this.openHint();
      else if (e.key === "Escape" && this.sheet.isOpen) this.closeHint();
    };
    addEventListener("keydown", onKey);
    this.offs.push(() => removeEventListener("keydown", onKey));
    this.tick = window.setInterval(() => this.onTick(), 1000);
    this.render();
    this.save();
    sound.startMusic();
  }

  destroy(): void {
    this.save();
    clearInterval(this.tick);
    for (const off of this.offs) off();
  }

  private render(): void {
    const g = this.game;
    const st = settings();
    const wrong = new Set<QCell>();
    if (st.checkMistakes) for (const q of g.queens()) if (!g.isSolutionCell(q)) wrong.add(q);
    this.board.render({ marks: g.marks, attacked: st.autoCross ? g.attacked() : null, conflicts: g.conflicts(), wrong });
    this.undoBtn.disabled = !g.canUndo();
    this.autoBtn.classList.toggle("on", st.autoCross);
    this.autoBtn.setAttribute("aria-pressed", String(st.autoCross));
    const p = g.progress();
    this.progressEl.style.width = `${(p * 100).toFixed(1)}%`;
    this.timerEl.textContent = st.showTimer ? formatTime(g.elapsedMs) : "";
    this.statsEl.replaceChildren(
      h("span", { class: g.mistakes ? "bad" : "" }, `Mistakes ${g.mistakes}`),
      h("span", null, `Hints ${g.hintsUsed}`),
      h("span", { class: "dim" }, `${g.queens().length} / ${g.n} queens`),
    );
    this.app.bg.setIntensity(0.15 + p * 0.85);
    sound.setIntensity(p);
  }

  private tap(c: QCell): void {
    sound.unlock();
    if (this.sheet.isOpen) this.closeHint();
    this.game.cycle(c);
  }

  private long(c: QCell): void {
    sound.unlock();
    if (this.sheet.isOpen) this.closeHint();
    if (this.game.marks[c] !== QUEEN) this.game.setMark(c, QUEEN);
    buzz("place");
  }

  private drag(cells: QCell[]): void {
    this.game.crossCells(cells);
  }

  private onEvent(e: QueensEvent): void {
    const fx = this.app.fx;
    const n = this.game.n;
    switch (e.type) {
      case "mark":
        if (e.mark === 1) {
          sound.cross();
          const p = this.board.center(e.cell);
          fx.burst(p.x, p.y, "#9fb3c8", { count: 4, speed: 70, size: 4, life: 0.35 });
        } else if (e.mark === 0) sound.erase();
        break;
      case "marks":
        sound.cross();
        break;
      case "queen": {
        this.last = e.cell;
        const p = this.board.center(e.cell);
        const color = REGION_COLORS[this.game.region(e.cell) % REGION_COLORS.length]!.color;
        this.board.pop(e.cell);
        sound.queen(colOf(e.cell, n), n);
        if (e.conflicts.length) {
          this.board.shake(e.cell);
          for (const q of e.conflicts) {
            const o = this.board.center(q);
            fx.beam(p.x, p.y, o.x, o.y, "#ff4d6d", 10, 0.7);
          }
          sound.mistake();
          buzz("mistake");
          toast(conflictText(this.game, e.cell, e.conflicts[0]!), "bad");
        } else if (!e.correct && settings().checkMistakes) {
          fx.burst(p.x, p.y, "#ff4d6d", { count: 10, speed: 120, size: 6 });
          sound.mistake();
          buzz("mistake");
          toast("That queen doesn't fit the solution. Hint can show you why.", "bad");
        } else {
          fx.burst(p.x, p.y, color, { count: 22, speed: 240, size: 9 });
          fx.ring(p.x, p.y, color, this.board.cellSize() * 1.4, 0.7, 3);
          this.app.bg.pulse(p.x, p.y, color, 0.8);
          buzz("place");
        }
        break;
      }
      case "complete": {
        const color = REGION_COLORS[this.game.region(e.cell) % REGION_COLORS.length]!.color;
        const r = rowOf(e.cell, n);
        const k = colOf(e.cell, n);
        const a = this.board.center(r * n);
        const b = this.board.center(r * n + n - 1);
        const c = this.board.center(k);
        const d = this.board.center((n - 1) * n + k);
        fx.beam(a.x, a.y, b.x, b.y, color, this.board.cellSize() * 0.7, 0.8);
        fx.beam(c.x, c.y, d.x, d.y, color, this.board.cellSize() * 0.7, 0.8);
        const regionCells = this.puzzle.regions.map((g, i) => (g === this.game.region(e.cell) ? i : -1)).filter((i) => i >= 0);
        this.board.sweep(regionCells, 30);
        const placed = this.game.queens().filter((q) => this.game.isSolutionCell(q)).length;
        if (placed < n) {
          const box = this.board.el.getBoundingClientRect();
          callout(`${placed} / ${n}`, { size: "small", color, y: box.top + box.height * 0.45 });
        }
        sound.complete(["region"]);
        break;
      }
      case "solved":
        this.finale();
        break;
      default:
        break;
    }
    this.render();
    this.save();
  }

  private finale(): void {
    const g = this.game;
    this.el.dataset.solved = "true";
    this.closeHint();
    this.board.wave(this.last);
    const pts = g.queens().map((q) => ({ ...this.board.center(q), color: REGION_COLORS[g.region(q) % REGION_COLORS.length]!.color }));
    setTimeout(() => this.app.fx.fireworks(pts), 250);
    const perfect = g.mistakes === 0 && g.hintsUsed === 0;
    const box = this.board.el.getBoundingClientRect();
    setTimeout(() => callout(perfect ? "PERFECT" : "SOLVED", { size: "huge", sub: formatTime(g.elapsedMs), y: box.top + box.height * 0.4 }), 350);
    this.app.bg.pulse(innerWidth / 2, box.top + box.height / 2, "#ffffff", 2.5);
    sound.solved();
    buzz("solved");
    recordSolve("queens", this.difficulty, this.puzzle.id, g.elapsedMs);
    clearSaved("queens");
    setTimeout(
      () =>
        showWin(this.el, {
          mode: "queens",
          difficulty: this.difficulty,
          perfect,
          time: g.elapsedMs,
          mistakes: g.mistakes,
          hints: g.hintsUsed,
          techniques: this.puzzle.meta?.techniques ?? [],
          onNext: () => void this.app.play("queens", this.difficulty, false, this.puzzle.id),
          onHome: () => void this.app.home(),
        }),
      2300,
    );
  }

  private openHint(): void {
    sound.unlock();
    if (this.game.solved) return;
    if (this.sheet.isOpen) return this.sheet.advance();
    this.hint = this.game.hint(NAMES);
    this.el.classList.add("hint-open");
    this.sheet.open(this.hint);
  }

  private onRung(r: number): void {
    if (!this.hint) return;
    this.game.recordRung(this.hint.kind === "step" ? r : 0);
    this.board.showHint(this.hint, r);
    sound.hint(r);
  }

  private applyHint(): void {
    const hint = this.hint;
    if (!hint) return;
    if (hint.technique) recordHint(hint.technique);
    this.closeHint();
    this.game.applyHint(hint);
    if (hint.step && !hint.step.placements.length) toast(`${hint.title}: ${hint.ladder.do}`, "good");
  }

  private closeHint(): void {
    this.sheet.close();
    this.hint = null;
    this.el.classList.remove("hint-open");
    this.board.showHint(null, 0);
  }

  private onTick(): void {
    if (document.hidden || this.game.solved || document.querySelector(".overlay")) return;
    this.game.elapsedMs += 1000;
    if (settings().showTimer) this.timerEl.textContent = formatTime(this.game.elapsedMs);
    if (Math.round(this.game.elapsedMs / 1000) % 5 === 0) this.save();
  }

  private save(): void {
    if (this.game.solved || this.discard) return;
    storeSaved("queens", { difficulty: this.difficulty, entry: encodeQueens(this.puzzle), state: this.game.toJSON() });
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
        item("New puzzle", ICONS.next, () => void this.app.play("queens", this.difficulty, false, this.puzzle.id)),
        item("Restart this puzzle", ICONS.restart, () => {
          this.discard = true;
          storeSaved("queens", { difficulty: this.difficulty, entry: encodeQueens(this.puzzle), state: new QueensGame(this.puzzle).toJSON() });
          void this.app.play("queens", this.difficulty, true);
        }),
        item("How to play & techniques", ICONS.book, () => openLearn("last-cell")),
        item("Settings", ICONS.gear, () => openSettings()),
      ),
    );
    document.body.append(menu);
  }
}

function conflictText(g: QueensGame, a: QCell, b: QCell): string {
  const n = g.n;
  if (rowOf(a, n) === rowOf(b, n)) return "Two queens can't share a row.";
  if (colOf(a, n) === colOf(b, n)) return "Two queens can't share a column.";
  if (g.region(a) === g.region(b)) return `The ${REGION_COLORS[g.region(a) % REGION_COLORS.length]!.name} region already has a queen.`;
  if (attacks(g.board, a).includes(b)) return "Queens can't touch — not even diagonally.";
  return "Those queens clash.";
}
