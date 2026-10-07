/**
 * Punctuation: big glowing words that slam in over the board when something completes —
 * "ROW 3", "DOUBLE", "SOLVED". One at a time; a newer callout replaces the current one.
 */
import { h } from "../dom";

let layer: HTMLElement | null = null;
let current: HTMLElement | null = null;

export function mountCallouts(root: HTMLElement): void {
  layer = h("div", { class: "callouts", "aria-live": "polite" });
  root.append(layer);
}

export interface CalloutOptions {
  sub?: string;
  color?: string;
  /** "small" for routine completions, "big" for multi-completions, "huge" for the solve. */
  size?: "small" | "big" | "huge";
  /** Vertical anchor in viewport px (defaults to the middle third). */
  y?: number;
}

export function callout(text: string, o: CalloutOptions = {}): void {
  if (!layer) return;
  current?.remove();
  const el = h(
    "div",
    {
      class: `callout ${o.size ?? "small"}`,
      style: { "--cc": o.color ?? "var(--a1)", ...(o.y !== undefined ? { top: `${o.y}px` } : {}) },
    },
    h("div", { class: "callout-text" }, text),
    o.sub ? h("div", { class: "callout-sub" }, o.sub) : null,
  );
  layer.append(el);
  current = el;
  el.addEventListener("animationend", (e) => {
    if ((e as AnimationEvent).animationName === "callout-out") {
      el.remove();
      if (current === el) current = null;
    }
  });
}
