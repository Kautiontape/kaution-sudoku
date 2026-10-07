/**
 * Queens board: glowing colour regions with thick borders, crowns and crosses.
 * Input: tap cycles empty → ✕ → queen, long-press drops a queen, dragging crosses cells.
 */
import { colOf, rowOf } from "../../engine/queens/geometry";
import type { QueensHint } from "../../engine/queens/hints";
import { CROSS, QUEEN, type QCell, type QueensPuzzle } from "../../engine/queens/types";
import { h, svgIcon } from "../dom";
import { ICONS } from "../icons";
import { REGION_COLORS } from "../palette";

export interface QueensBoardHandlers {
  onTap(c: QCell): void;
  onLong(c: QCell): void;
  onDrag(cells: QCell[]): void;
}

export interface QueensView {
  marks: Uint8Array;
  attacked: Uint8Array | null;
  conflicts: Set<QCell>;
  wrong: Set<QCell>;
}

const LONG_MS = 420;

export class QueensBoard {
  readonly el: HTMLElement;
  private board: HTMLElement;
  private cells: HTMLElement[] = [];
  private hint: QueensHint | null = null;
  private rung = 0;
  readonly n: number;

  constructor(
    private puzzle: QueensPuzzle,
    private handlers: QueensBoardHandlers,
  ) {
    const n = (this.n = puzzle.n);
    this.board = h("div", { class: "qboard", role: "grid", "aria-label": "Queens board", "data-testid": "qboard", style: { "--n": String(n) } });
    const reg = puzzle.regions;
    for (let c = 0; c < n * n; c++) {
      const r = rowOf(c, n);
      const k = colOf(c, n);
      const g = reg[c]!;
      const color = REGION_COLORS[g % REGION_COLORS.length]!;
      const cls = ["qcell"];
      if (r === 0 || reg[c - n] !== g) cls.push("bt");
      if (r === n - 1 || reg[c + n] !== g) cls.push("bb");
      if (k === 0 || reg[c - 1] !== g) cls.push("bl");
      if (k === n - 1 || reg[c + 1] !== g) cls.push("br");
      const cell = h(
        "div",
        { class: cls.join(" "), role: "gridcell", "data-cell": String(c), "data-region": String(g), style: { "--rc": color.color } },
        h("span", { class: "qmark" }),
      );
      this.cells.push(cell);
      this.board.append(cell);
    }
    this.attachInput();
    this.el = h("div", { class: "qboard-wrap" }, this.board);
  }

  private cellAtPoint(x: number, y: number): QCell | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>(".qcell");
    return el && this.board.contains(el) ? Number(el.dataset.cell) : null;
  }

  private attachInput(): void {
    let start: QCell | null = null;
    let dragged: QCell[] = [];
    let longFired = false;
    let timer = 0;
    this.board.addEventListener("pointerdown", (e) => {
      const c = this.cellAtPoint(e.clientX, e.clientY);
      if (c === null) return;
      e.preventDefault();
      this.board.setPointerCapture(e.pointerId);
      start = c;
      dragged = [];
      longFired = false;
      timer = window.setTimeout(() => {
        longFired = true;
        if (start !== null && !dragged.length) this.handlers.onLong(start);
      }, LONG_MS);
    });
    this.board.addEventListener("pointermove", (e) => {
      if (start === null || longFired) return;
      const c = this.cellAtPoint(e.clientX, e.clientY);
      if (c === null || c === start || dragged.includes(c)) return;
      clearTimeout(timer);
      if (!dragged.length) dragged.push(start);
      dragged.push(c);
      this.handlers.onDrag([...dragged]);
    });
    const end = () => {
      clearTimeout(timer);
      if (start !== null && !longFired && !dragged.length) this.handlers.onTap(start);
      start = null;
      dragged = [];
    };
    this.board.addEventListener("pointerup", end);
    this.board.addEventListener("pointercancel", () => {
      clearTimeout(timer);
      start = null;
      dragged = [];
    });
    this.board.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  center(c: QCell): { x: number; y: number } {
    const r = this.cells[c]!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  cellSize(): number {
    return this.cells[0]!.getBoundingClientRect().width;
  }

  render(v: QueensView): void {
    for (let c = 0; c < this.cells.length; c++) {
      const el = this.cells[c]!;
      const m = v.marks[c]!;
      const mark = el.firstElementChild as HTMLElement;
      const isQueen = m === QUEEN;
      const isCross = m === CROSS;
      const auto = !isQueen && !isCross && v.attacked?.[c] === 1;
      el.classList.toggle("queen", isQueen);
      el.classList.toggle("cross", isCross);
      el.classList.toggle("auto-x", auto);
      el.classList.toggle("conflict", v.conflicts.has(c));
      el.classList.toggle("wrong", v.wrong.has(c));
      const want = isQueen ? "q" : isCross || auto ? "x" : "";
      if (mark.dataset.kind !== want) {
        mark.dataset.kind = want;
        mark.replaceChildren(...(want === "q" ? [svgIcon(ICONS.crown, "icon crown")] : want === "x" ? [svgIcon(ICONS.cross, "icon xmark")] : []));
      }
      const region = this.puzzle.regions[c]!;
      el.setAttribute(
        "aria-label",
        `r${rowOf(c, this.n) + 1}c${colOf(c, this.n) + 1}, ${REGION_COLORS[region % REGION_COLORS.length]!.name}${isQueen ? ", queen" : isCross ? ", crossed" : ""}`,
      );
    }
    this.applyHint();
  }

  private restart(el: Element, cls: string): void {
    el.classList.remove(cls);
    void (el as HTMLElement).offsetWidth;
    el.classList.add(cls);
    el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
  }

  pop(c: QCell): void {
    this.restart(this.cells[c]!, "pop");
  }
  shake(c: QCell): void {
    this.restart(this.cells[c]!, "shake");
  }
  sweep(cells: QCell[], stagger = 40): void {
    cells.forEach((c, i) => {
      const el = this.cells[c]!;
      el.style.setProperty("--delay", `${i * stagger}ms`);
      this.restart(el, "sweep");
    });
  }
  wave(from: QCell): void {
    const r0 = rowOf(from, this.n);
    const c0 = colOf(from, this.n);
    this.cells.forEach((el, c) => {
      el.style.setProperty("--delay", `${Math.round(Math.hypot(rowOf(c, this.n) - r0, colOf(c, this.n) - c0) * 80)}ms`);
      this.restart(el, "wave");
    });
  }
  punch(): void {
    this.restart(this.el, "punch");
  }

  showHint(hint: QueensHint | null, rung: number): void {
    this.hint = hint;
    this.rung = rung;
    this.applyHint();
  }

  private applyHint(): void {
    for (const el of this.cells) el.classList.remove("h-area", "h-dim", "h-focus", "h-elim", "h-place", "h-chain", "h-wrong");
    this.board.classList.toggle("hinting", !!this.hint && this.rung > 0);
    const hint = this.hint;
    if (!hint || this.rung <= 0) return;
    const n = this.n;
    const area = new Set<QCell>();
    const step = hint.step;
    if (step) {
      for (const r of step.focus.rows) for (let k = 0; k < n; k++) area.add(r * n + k);
      for (const k of step.focus.cols) for (let r = 0; r < n; r++) area.add(r * n + k);
      for (const g of step.focus.regions) this.puzzle.regions.forEach((x, c) => x === g && area.add(c));
      if (!area.size) for (const c of step.focus.cells) area.add(c);
    } else for (const c of hint.wrongCells ?? []) for (let k = 0; k < n; k++) area.add(rowOf(c, n) * n + k);
    this.cells.forEach((el, c) => el.classList.add(area.has(c) ? "h-area" : "h-dim"));
    if (this.rung < 2) return;
    const focus = step ? step.focus.cells : (hint.wrongCells ?? []);
    for (const c of focus) this.cells[c]?.classList.add("h-focus");
    if (this.rung < 3) return;
    if (step) {
      for (const c of step.eliminations) this.cells[c]?.classList.add("h-elim");
      for (const c of step.placements) this.cells[c]?.classList.add("h-place");
      const chain = (step.explain as { chain?: { cell: QCell }[] }).chain;
      chain?.forEach((l, i) => {
        const el = this.cells[l.cell];
        if (!el) return;
        el.classList.add("h-chain");
        el.style.setProperty("--chain", `"${i + 1}"`);
      });
    } else for (const c of hint.wrongCells ?? []) this.cells[c]?.classList.add("h-wrong");
  }
}
