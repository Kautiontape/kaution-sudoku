/**
 * The 9×9 board. DOM cells (crisp digits, accessible gridcells) under an SVG overlay that carries
 * the glowing grid lines, killer cage outlines, and hint visuals: sight lines from the digits that
 * justify a step, chain arrows between candidates, and virtual (45-rule) cages.
 */
import { digitsOf } from "../../engine/combos";
import { boxOf, CELL_HOUSES, cellName, colOf, HOUSE_CELLS, houseIndex, rowOf } from "../../engine/geometry";
import type { SudokuHint } from "../../engine/hints/index";
import type { CandidateMark, CellId, Puzzle } from "../../engine/types";
import { cageAnchor } from "../../engine/hints/format";
import { h, s } from "../dom";
import { DIGIT_COLORS } from "../palette";
import { cagePath, colorCages } from "./cage-paths";

export interface BoardView {
  grid: Uint8Array;
  notes: Uint16Array;
  given: Uint8Array;
  solution: Uint8Array;
  selected: CellId | null;
  /** Digit to highlight across the board (0 = none). */
  highlightDigit: number;
  showWrong: boolean;
  cageTint: boolean;
}

const UNIT = 100; // SVG units per cell
const CAGE_TINTS = 5;

export class SudokuBoard {
  readonly el: HTMLElement;
  private board: HTMLElement;
  private cellEls: HTMLElement[] = [];
  private valEls: HTMLElement[] = [];
  private noteWrap: HTMLElement[] = [];
  private noteEls: HTMLElement[][] = [];
  private svg: SVGSVGElement;
  private tintG: SVGGElement;
  private cageG: SVGGElement;
  private hintG: SVGGElement;
  private cagePaths = new Map<number, SVGPathElement>();
  private cageOfCell = new Int16Array(81).fill(-1);
  private hint: SudokuHint | null = null;
  private hintRung = 0;
  private hintCand: Uint16Array | null = null;
  private last: BoardView | null = null;

  constructor(
    private puzzle: Puzzle,
    onSelect: (cell: CellId, e: PointerEvent) => void,
  ) {
    const killer = puzzle.cages.length > 0;
    this.board = h("div", { class: `board${killer ? " killer" : ""}`, role: "grid", "aria-label": "Sudoku board", "data-testid": "board" });
    for (let c = 0; c < 81; c++) {
      const val = h("span", { class: "v" });
      const notes = h("div", { class: "notes" });
      const ns: HTMLElement[] = [];
      for (let d = 1; d <= 9; d++) {
        const i = h("i", null, String(d));
        ns.push(i);
        notes.append(i);
      }
      const cell = h(
        "div",
        {
          class: "cell",
          role: "gridcell",
          "data-cell": String(c),
          "data-r": String(rowOf(c)),
          "data-c": String(colOf(c)),
          "data-b": String(boxOf(c)),
        },
        val,
        notes,
      );
      cell.addEventListener("pointerdown", (e) => onSelect(c, e));
      this.cellEls.push(cell);
      this.valEls.push(val);
      this.noteWrap.push(notes);
      this.noteEls.push(ns);
      this.board.append(cell);
    }

    this.svg = s("svg", { class: "board-svg", viewBox: `0 0 ${9 * UNIT} ${9 * UNIT}`, preserveAspectRatio: "none" });
    const defs = s(
      "defs",
      null,
      s("filter", { id: "glow", x: "-50%", y: "-50%", width: "200%", height: "200%" }, s("feGaussianBlur", { stdDeviation: "6", result: "b" }), s("feMerge", null, s("feMergeNode", { in: "b" }), s("feMergeNode", { in: "SourceGraphic" }))),
      s("marker", { id: "arrow", viewBox: "0 0 10 10", refX: "8", refY: "5", markerWidth: "5", markerHeight: "5", orient: "auto-start-reverse" }, s("path", { d: "M0,0 L10,5 L0,10 z", class: "arrow-head" })),
    );
    this.tintG = s("g", { class: "tints" });
    const grid = s("g", { class: "gridlines" });
    for (let i = 1; i < 9; i++) {
      const cls = i % 3 === 0 ? "box-line" : "cell-line";
      grid.append(s("line", { x1: i * UNIT, y1: 0, x2: i * UNIT, y2: 9 * UNIT, class: cls }));
      grid.append(s("line", { x1: 0, y1: i * UNIT, x2: 9 * UNIT, y2: i * UNIT, class: cls }));
    }
    this.cageG = s("g", { class: "cages" });
    this.hintG = s("g", { class: "hint-layer" });
    this.svg.append(defs, this.tintG, grid, this.cageG, this.hintG);

    const sums = h("div", { class: "sums" });
    if (killer) {
      const colors = colorCages(puzzle.cages, CAGE_TINTS);
      puzzle.cages.forEach((cage, i) => {
        for (const c of cage.cells) {
          this.cageOfCell[c] = i;
          this.cellEls[c]!.dataset.cage = String(cage.id);
        }
        this.tintG.append(s("path", { d: cagePath(cage.cells, 0, UNIT), class: `tint t${colors[i]}` }));
        const p = s("path", { d: cagePath(cage.cells, 0.085, UNIT), class: "cage" });
        this.cagePaths.set(cage.id, p);
        this.cageG.append(p);
        const a = cageAnchor(cage);
        sums.append(
          h(
            "span",
            { class: "sum", style: { left: `${(colOf(a) / 9) * 100}%`, top: `${(rowOf(a) / 9) * 100}%` }, "data-cage": String(cage.id) },
            String(cage.sum),
          ),
        );
        this.cellEls[a]!.classList.add("has-sum");
      });
    }
    this.el = h("div", { class: "board-wrap" }, this.board, this.svg, sums);
  }

  cell(c: CellId): HTMLElement {
    return this.cellEls[c]!;
  }

  center(c: CellId): { x: number; y: number } {
    const r = this.cellEls[c]!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  cellSize(): number {
    return this.cellEls[0]!.getBoundingClientRect().width;
  }

  // ------------------------------------------------------------------------------------------

  render(v: BoardView): void {
    this.last = v;
    const sel = v.selected;
    const selHouses = sel !== null ? CELL_HOUSES[sel]! : null;
    const selCage = sel !== null ? this.cageOfCell[sel]! : -1;
    const hd = v.highlightDigit;
    this.board.classList.toggle("tinted", v.cageTint);
    for (let c = 0; c < 81; c++) {
      const el = this.cellEls[c]!;
      const d = v.grid[c]!;
      const wrong = v.showWrong && d !== 0 && d !== v.solution[c];
      const cls = el.classList;
      cls.toggle("given", v.given[c] === 1);
      cls.toggle("user", d !== 0 && v.given[c] !== 1);
      cls.toggle("filled", d !== 0);
      cls.toggle("wrong", wrong);
      cls.toggle("sel", c === sel);
      cls.toggle("peer", sel !== null && c !== sel && CELL_HOUSES[c]!.some((x) => selHouses!.includes(x)));
      cls.toggle("cage-peer", selCage >= 0 && c !== sel && this.cageOfCell[c] === selCage);
      cls.toggle("same", hd !== 0 && d === hd);
      if (d) el.style.setProperty("--dc", DIGIT_COLORS[d]!);
      this.valEls[c]!.textContent = d ? String(d) : "";
      const notes = d ? 0 : v.notes[c]!;
      const ns = this.noteEls[c]!;
      for (let k = 1; k <= 9; k++) {
        const on = (notes & (1 << k)) !== 0;
        const n = ns[k - 1]!;
        n.classList.toggle("on", on);
        n.classList.toggle("match", on && k === hd);
        n.className = n.className.replace(/\bm-\w+\b|\bghost\b/g, "").trim();
      }
      el.setAttribute(
        "aria-label",
        d ? `${cellName(c)}, ${d}${v.given[c] ? ", given" : ""}${wrong ? ", wrong" : ""}` : `${cellName(c)}, empty${notes ? `, notes ${digitsOf(notes).join(" ")}` : ""}`,
      );
    }
    // Conflicts: any wrong digit lights up the cells it clashes with.
    for (let c = 0; c < 81; c++) this.cellEls[c]!.classList.remove("conflict");
    if (v.showWrong)
      for (let c = 0; c < 81; c++) {
        const d = v.grid[c]!;
        if (!d || d === v.solution[c]) continue;
        for (const hh of CELL_HOUSES[c]!) for (const p of HOUSE_CELLS[hh]!) if (p !== c && v.grid[p] === d) this.cellEls[p]!.classList.add("conflict");
      }
    this.applyHint();
  }

  // ------------------------------------------------------------------------------------------
  // Animations

  private restart(el: Element, cls: string): void {
    el.classList.remove(cls);
    void (el as HTMLElement).offsetWidth;
    el.classList.add(cls);
    el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
  }

  pop(c: CellId): void {
    this.restart(this.cellEls[c]!, "pop");
  }

  shake(c: CellId): void {
    this.restart(this.cellEls[c]!, "shake");
  }

  /** Sequential light sweep over cells (house completion). */
  sweep(cells: CellId[], stagger = 38): void {
    cells.forEach((c, i) => {
      const el = this.cellEls[c]!;
      el.style.setProperty("--delay", `${i * stagger}ms`);
      this.restart(el, "sweep");
    });
  }

  /** Light running around a cage outline. */
  litCage(id: number): void {
    const p = this.cagePaths.get(id);
    if (p) this.restart(p, "lit");
  }

  /** Solve wave: every cell flares, delayed by distance from the last move. */
  wave(from: CellId): void {
    const r0 = rowOf(from);
    const c0 = colOf(from);
    for (let c = 0; c < 81; c++) {
      const el = this.cellEls[c]!;
      const dist = Math.hypot(rowOf(c) - r0, colOf(c) - c0);
      el.style.setProperty("--delay", `${Math.round(dist * 70)}ms`);
      this.restart(el, "wave");
    }
  }

  punch(): void {
    this.restart(this.el, "punch");
  }

  // ------------------------------------------------------------------------------------------
  // Hints

  showHint(hint: SudokuHint | null, rung: number, cand: Uint16Array | null): void {
    this.hint = hint;
    this.hintRung = rung;
    this.hintCand = cand;
    this.applyHint();
  }

  private applyHint(): void {
    const hint = this.hint;
    const rung = this.hintRung;
    for (const el of this.cellEls) el.classList.remove("h-area", "h-dim", "h-focus", "h-source", "h-target", "h-place", "h-elim");
    while (this.hintG.firstChild) this.hintG.firstChild.remove();
    for (const p of this.cagePaths.values()) p.classList.remove("h-cage");
    this.board.classList.toggle("hinting", !!hint && rung > 0);
    if (!hint || rung <= 0) return;

    const step = hint.step;
    const area = new Set<CellId>();
    if (step) {
      for (const hs of step.focus.houses) for (const c of HOUSE_CELLS[houseIndex(hs)]!) area.add(c);
      for (const id of step.focus.cages) for (const c of this.puzzle.cages.find((x) => x.id === id)?.cells ?? []) area.add(c);
      if (!area.size) for (const c of step.focus.cells) area.add(c);
    } else for (const c of hint.cells ?? []) for (const x of HOUSE_CELLS[CELL_HOUSES[c]![2]]!) area.add(x);

    for (let c = 0; c < 81; c++) this.cellEls[c]!.classList.toggle(area.has(c) ? "h-area" : "h-dim", true);
    if (rung < 2) return;

    const focus = step ? step.focus.cells : (hint.cells ?? []);
    for (const c of focus) this.cellEls[c]!.classList.add("h-focus");
    if (step) for (const id of step.focus.cages) this.cagePaths.get(id)?.classList.add("h-cage");
    if (rung < 3) return;

    if (step) {
      for (const c of step.sources ?? []) this.cellEls[c]!.classList.add("h-source");
      for (const e of step.eliminations) this.cellEls[e.cell]!.classList.add("h-target");
      for (const p of step.placements) this.cellEls[p.cell]!.classList.add("h-place");
      this.drawMarks(step.marks ?? []);
      this.drawSightLines();
      for (const l of step.links ?? []) this.drawLink(l.from, l.to, l.strong);
      for (const vc of step.virtualCages ?? []) this.hintG.append(s("path", { d: cagePath(vc.cells, 0.17, UNIT), class: "virtual-cage" }));
    } else {
      for (const c of hint.cells ?? []) this.cellEls[c]!.classList.add(hint.kind === "mistake" ? "h-elim" : "h-target");
    }
  }

  /** Ghost candidates with SudokuWiki-style roles. */
  private drawMarks(marks: CandidateMark[]): void {
    const byCell = new Map<CellId, CandidateMark[]>();
    for (const m of marks) byCell.set(m.cell, [...(byCell.get(m.cell) ?? []), m]);
    const v = this.last;
    for (const [c, ms] of byCell) {
      if (v?.grid[c]) continue;
      const ns = this.noteEls[c]!;
      const shown = this.hintCand?.[c] ?? 0;
      for (let d = 1; d <= 9; d++) {
        const n = ns[d - 1]!;
        if (shown & (1 << d) && !n.classList.contains("on")) n.classList.add("ghost");
      }
      for (const m of ms) {
        const n = ns[m.digit - 1]!;
        if (!n.classList.contains("on")) n.classList.add("ghost");
        n.classList.add(`m-${m.role}`);
      }
    }
  }

  /** Lines from the digits that justify a single to the cells they block. */
  private drawSightLines(): void {
    const step = this.hint?.step;
    if (!step?.sources?.length) return;
    const ex = step.explain as Record<string, unknown>;
    const pairs: [CellId, CellId][] = [];
    if (Array.isArray(ex.blocked))
      for (const b of ex.blocked as { cell: CellId; by: CellId | null }[]) if (b.by !== null) pairs.push([b.by, b.cell]);
    if (Array.isArray(ex.seen)) for (const b of ex.seen as { by: CellId | null }[]) if (b.by !== null) pairs.push([b.by, ex.cell as CellId]);
    if (!pairs.length) for (const src of step.sources) for (const p of step.placements) pairs.push([src, p.cell]);
    // Collapse to the farthest target per source and direction.
    const best = new Map<string, [CellId, CellId]>();
    for (const [a, b] of pairs) {
      const dir = rowOf(a) === rowOf(b) ? `r${Math.sign(colOf(b) - colOf(a))}` : colOf(a) === colOf(b) ? `c${Math.sign(rowOf(b) - rowOf(a))}` : `x${b}`;
      const key = `${a}:${dir}`;
      const cur = best.get(key);
      const dist = Math.abs(rowOf(b) - rowOf(a)) + Math.abs(colOf(b) - colOf(a));
      if (!cur || dist > Math.abs(rowOf(cur[1]) - rowOf(a)) + Math.abs(colOf(cur[1]) - colOf(a))) best.set(key, [a, b]);
    }
    for (const [a, b] of best.values()) {
      const [x1, y1] = [(colOf(a) + 0.5) * UNIT, (rowOf(a) + 0.5) * UNIT];
      const [x2, y2] = [(colOf(b) + 0.5) * UNIT, (rowOf(b) + 0.5) * UNIT];
      this.hintG.append(s("line", { x1, y1, x2, y2, class: "sight" }));
    }
  }

  private candPoint(cell: CellId, digit: number): [number, number] {
    const n = this.noteEls[cell]![digit - 1]!.getBoundingClientRect();
    const b = this.board.getBoundingClientRect();
    if (!b.width) {
      const k = digit - 1;
      return [(colOf(cell) + 0.17 + (k % 3) * 0.33) * UNIT, (rowOf(cell) + 0.17 + Math.floor(k / 3) * 0.33) * UNIT];
    }
    return [((n.left + n.width / 2 - b.left) / b.width) * 9 * UNIT, ((n.top + n.height / 2 - b.top) / b.height) * 9 * UNIT];
  }

  private drawLink(from: { cell: CellId; digit: number }, to: { cell: CellId; digit: number }, strong: boolean): void {
    const [x1, y1] = this.candPoint(from.cell, from.digit);
    const [x2, y2] = this.candPoint(to.cell, to.digit);
    // Shorten both ends so arrows don't cover the digits, and bow the curve slightly.
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(14, len / 3);
    const ax = x1 + (dx / len) * k;
    const ay = y1 + (dy / len) * k;
    const bx = x2 - (dx / len) * k;
    const by = y2 - (dy / len) * k;
    const mx = (ax + bx) / 2 - (dy / len) * len * 0.12;
    const my = (ay + by) / 2 + (dx / len) * len * 0.12;
    this.hintG.append(s("path", { d: `M${ax} ${ay} Q${mx} ${my} ${bx} ${by}`, class: strong ? "link strong" : "link weak", "marker-end": "url(#arrow)" }));
  }
}
