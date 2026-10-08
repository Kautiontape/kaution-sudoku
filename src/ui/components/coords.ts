/**
 * Row and column numbers around a board, shown faintly while a hint is open so "r9c8" is quick to
 * find. The row and column of each square the hint names light up in that square's colour.
 */
import { h } from "../dom";

export class Coords {
  readonly el: HTMLElement;
  private rows: HTMLElement[] = [];
  private cols: HTMLElement[] = [];

  constructor(n: number) {
    const at = (i: number) => `${((i + 0.5) / n) * 100}%`;
    for (let i = 0; i < n; i++) {
      this.cols.push(h("span", { class: "coord col", style: { left: at(i) } }, String(i + 1)));
      this.rows.push(h("span", { class: "coord row", style: { top: at(i) } }, String(i + 1)));
    }
    this.el = h("div", { class: "coords", "aria-hidden": "true" }, ...this.cols, ...this.rows);
  }

  /** Light the rows and columns of these squares (0-based row, col → colour). */
  light(squares: readonly { row: number; col: number; color: string }[]): void {
    for (const el of [...this.rows, ...this.cols]) el.classList.remove("lit");
    for (const s of squares)
      for (const el of [this.rows[s.row], this.cols[s.col]]) {
        if (!el || el.classList.contains("lit")) continue;
        el.classList.add("lit");
        el.style.setProperty("--ref", s.color);
      }
  }
}
