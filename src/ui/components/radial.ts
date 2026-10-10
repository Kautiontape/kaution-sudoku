/**
 * Long-press number wheel. Holding an empty square floats a dot for each digit around it; dragging
 * toward one and letting go enters it (as an answer or a note, depending on the mode). The geometry
 * is pure so the direction→digit pick is unit-tested; the `Radial` class is just the dots and the
 * highlight — the board drives it and the play screen turns a pick into a placement.
 */
import { h } from "../dom";
import { DIGIT_COLORS } from "../palette";

/** 1 sits at 12 o'clock; 2…9 follow clockwise, evenly spaced. */
const START = -Math.PI / 2;
const STEP = (2 * Math.PI) / 9;

export function radialAngle(digit: number): number {
  return START + (digit - 1) * STEP;
}

/** Unit direction of a digit's dot (x right, y down — screen space, where y grows downward). */
export function radialDot(digit: number): { x: number; y: number } {
  const a = radialAngle(digit);
  return { x: Math.cos(a), y: Math.sin(a) };
}

/** Smallest signed difference a − b, wrapped to (−π, π]. */
function angleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/**
 * Which digit a drag points at. `(dx, dy)` is the drag from the press point in screen space. Returns
 * 0 when the drag is shorter than `deadzone`, so letting go near the centre picks nothing.
 */
export function radialPick(dx: number, dy: number, deadzone: number): number {
  if (Math.hypot(dx, dy) < deadzone) return 0;
  const p = Math.atan2(dy, dx);
  let best = 1;
  let bestD = Infinity;
  for (let d = 1; d <= 9; d++) {
    const diff = Math.abs(angleDiff(p, radialAngle(d)));
    if (diff < bestD) {
      bestD = diff;
      best = d;
    }
  }
  return best;
}

export class Radial {
  readonly el: HTMLElement;
  private dots: HTMLElement[] = [];
  private lit = 0;

  constructor() {
    this.el = h("div", { class: "radial", "data-testid": "radial", "aria-hidden": "true" });
    for (let d = 1; d <= 9; d++) {
      const { x, y } = radialDot(d);
      const dot = h(
        "span",
        { class: "radial-dot", "data-digit": String(d), style: { "--x": x.toFixed(4), "--y": y.toFixed(4), "--dc": DIGIT_COLORS[d]! } },
        String(d),
      );
      this.dots.push(dot);
      this.el.append(dot);
    }
  }

  /** Float the wheel: `left`/`top` are its centre in board-wrap coordinates, `radius` its reach. */
  open(left: number, top: number, radius: number): void {
    this.el.style.setProperty("--r", `${radius}px`);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    this.highlight(0);
    this.el.classList.add("open");
  }

  /** Light the targeted digit's dot (0 = none). */
  highlight(digit: number): void {
    if (digit === this.lit) return;
    this.lit = digit;
    this.dots.forEach((dot, i) => dot.classList.toggle("on", i + 1 === digit));
  }

  close(): void {
    this.el.classList.remove("open");
    this.highlight(0);
  }
}
