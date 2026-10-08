import { h } from "../dom";

let layer: HTMLElement | null = null;
let timer = 0;

export function mountToasts(root: HTMLElement): void {
  layer = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
  root.append(layer);
}

/** Show one message at a time; tone colours the glow. `ifIdle` skips it if another is showing. */
export function toast(text: string, tone: "info" | "bad" | "good" = "info", ms = 3200, ifIdle = false): void {
  if (!layer) return;
  if (ifIdle && layer.querySelector(".toast:not(.out)")) return;
  layer.replaceChildren(h("div", { class: `toast ${tone}`, "data-testid": "toast" }, text));
  clearTimeout(timer);
  timer = window.setTimeout(() => layer?.firstElementChild?.classList.add("out"), ms);
}

export function clearToast(): void {
  layer?.replaceChildren();
}
