/**
 * The results banner: after a level, a translucent strip across the top with the time, whether
 * it's a record, mistakes and hints — readable at a glance while the next level drops in below.
 * It never blocks play; it fades on its own, or sooner with a tap. Scores keeps the history.
 */
import { formatTime, h } from "../dom";
import { DIFFICULTY_LABEL, MODE_LABEL } from "../messages";
import type { ResultEntry } from "../store";

let layer: HTMLElement | null = null;
let timer = 0;

export function mountResults(root: HTMLElement): void {
  layer = h("div", { class: "results-layer", role: "status", "aria-live": "polite" });
  root.append(layer);
}

const word = (n: number, one: string) => (n === 1 ? one : `${one}s`);

export function showResult(r: ResultEntry, ms = 6500): void {
  if (!layer) return;
  const stat = (value: string, label: string, cls = "") => h("span", { class: `rstat ${cls}` }, h("b", null, value), h("small", null, label));
  const best = r.record
    ? stat(formatTime(r.prevBest ?? r.time), "old best", "dim")
    : r.first
      ? stat("—", "first clear", "dim")
      : stat(formatTime(r.prevBest ?? r.time), "best", "dim");
  const banner = h(
    "div",
    {
      class: `result${r.perfect ? " perfect" : ""}${r.record ? " record" : ""}`,
      "data-testid": "result",
      title: "Tap to dismiss",
      onclick: () => hide(banner),
    },
    h(
      "span",
      { class: "result-head" },
      h("span", { class: "result-kicker" }, `${MODE_LABEL[r.mode] ?? r.mode} · ${DIFFICULTY_LABEL[r.difficulty] ?? r.difficulty} · Level ${r.level}`),
      r.record ? h("span", { class: "result-badge" }, "★ New record") : null,
      h("b", { class: "result-title" }, r.perfect ? "Perfect" : "Solved"),
    ),
    h(
      "span",
      { class: "result-stats" },
      stat(formatTime(r.time), "time", r.record ? "gold" : ""),
      stat(String(r.mistakes), word(r.mistakes, "mistake"), r.mistakes ? "" : "clean"),
      stat(String(r.hints), word(r.hints, "hint"), r.hints ? "" : "clean"),
      best,
    ),
  );
  layer.replaceChildren(banner);
  clearTimeout(timer);
  timer = window.setTimeout(() => hide(banner), ms);
}

function hide(banner: HTMLElement): void {
  if (!banner.isConnected || banner.classList.contains("out")) return;
  banner.classList.add("out");
  banner.addEventListener("animationend", () => banner.remove(), { once: true });
}

export function clearResult(): void {
  clearTimeout(timer);
  layer?.replaceChildren();
}
