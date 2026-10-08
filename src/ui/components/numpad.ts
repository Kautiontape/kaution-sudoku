/**
 * Digit pad. Tap = place (or pencil in notes mode, or with Shift held); hold = light that digit up
 * across the grid, placing nothing. Each key shows how many of that digit are still missing; finished digits dim.
 */
import { h, shiftOnly } from "../dom";
import { DIGIT_COLORS } from "../palette";

export interface NumpadHandlers {
  /** asNote: Shift was held, so pencil it in. */
  onDigit(d: number, asNote: boolean): void;
  /** The key was held: show where that digit is, don't place it. */
  onHold(d: number): void;
}

const LONG_PRESS_MS = 380;

export class Numpad {
  readonly el: HTMLElement;
  private keys: HTMLButtonElement[] = [];
  private counts: HTMLElement[] = [];

  constructor(handlers: NumpadHandlers) {
    this.el = h("div", { class: "numpad", role: "group", "aria-label": "Digits" });
    for (let d = 1; d <= 9; d++) {
      const count = h("small", null, "");
      // In notes mode the digit moves to where that note sits inside a cell (1 top-left … 9 bottom-right).
      const pos = `${Math.floor((d - 1) / 3) + 1} / ${((d - 1) % 3) + 1}`;
      const key = h(
        "button",
        { class: "num", type: "button", "aria-label": `Digit ${d}`, "data-digit": String(d), style: { "--dc": DIGIT_COLORS[d]!, "--pos": pos } },
        h("span", null, String(d)),
        count,
      );
      let timer = 0;
      let long = false;
      key.addEventListener("pointerdown", (e) => {
        long = false;
        key.setPointerCapture?.(e.pointerId);
        timer = window.setTimeout(() => {
          long = true;
          key.classList.add("long");
          handlers.onHold(d);
        }, LONG_PRESS_MS);
      });
      const end = () => {
        clearTimeout(timer);
        key.classList.remove("long");
      };
      key.addEventListener("pointerup", (e) => {
        end();
        if (!long) handlers.onDigit(d, shiftOnly(e));
      });
      key.addEventListener("pointercancel", end);
      // A keyboard press on a focused key arrives as a click with no pointer (detail 0).
      key.addEventListener("click", (e) => e.detail === 0 && handlers.onDigit(d, shiftOnly(e)));
      key.addEventListener("contextmenu", (e) => e.preventDefault());
      this.keys.push(key);
      this.counts.push(count);
      this.el.append(key);
    }
  }

  /** remaining[d] = how many more of digit d are needed. */
  update(remaining: number[], notesMode: boolean, active: number): void {
    this.el.classList.toggle("notes-mode", notesMode);
    this.keys.forEach((k, i) => {
      const left = remaining[i + 1] ?? 0;
      k.classList.toggle("done", left <= 0);
      k.classList.toggle("active", active === i + 1);
      this.counts[i]!.textContent = left > 0 ? String(left) : "✓";
    });
  }
}
