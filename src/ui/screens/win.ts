/** The post-solve card: time, mistakes, hints, and the techniques this puzzle needed. */
import { techniqueName } from "../../engine/catalog";
import { queensTechniqueInfo } from "../../engine/queens/catalog";
import type { Difficulty } from "../../engine/types";
import { formatTime, h, svgIcon } from "../dom";
import { ICONS } from "../icons";
import { DIFFICULTY_LABEL, MODE_LABEL } from "../messages";
import { loadProgress } from "../store";
import { openLearn } from "./learn";

export interface WinInfo {
  mode: "classic" | "killer" | "queens";
  difficulty: Difficulty;
  perfect: boolean;
  time: number;
  mistakes: number;
  hints: number;
  techniques: string[];
  onNext(): void;
  onHome(): void;
}

export function showWin(host: HTMLElement, info: WinInfo): void {
  const progress = loadProgress();
  const best = progress.best[`${info.mode}-${info.difficulty}`];
  const isBest = best !== undefined && best >= info.time;
  const name = (id: string) => (info.mode === "queens" ? (queensTechniqueInfo(id)?.name ?? id) : techniqueName(id));
  const stat = (label: string, value: string, cls = "") => h("div", { class: `stat ${cls}` }, h("b", null, value), h("small", null, label));
  const card = h(
    "div",
    { class: "win-card", role: "dialog", "aria-label": "Puzzle solved", "data-testid": "win" },
    h("div", { class: "win-kicker" }, `${MODE_LABEL[info.mode]} · ${DIFFICULTY_LABEL[info.difficulty]}`),
    h("h2", { class: "win-title" }, info.perfect ? "Perfect" : "Solved"),
    h(
      "div",
      { class: "win-stats" },
      stat(isBest ? "time · best!" : "time", formatTime(info.time), isBest ? "best" : ""),
      stat("mistakes", String(info.mistakes)),
      stat("hints", String(info.hints)),
    ),
    info.techniques.length
      ? h(
          "div",
          { class: "win-techs" },
          h("small", null, "This puzzle needed"),
          h(
            "div",
            { class: "chips" },
            ...info.techniques.map((id) => h("button", { class: "chip tech-chip", type: "button", onclick: () => openLearn(id) }, name(id))),
          ),
        )
      : null,
    h(
      "div",
      { class: "win-actions" },
      h("button", { class: "btn ghost", type: "button", onclick: () => info.onHome() }, "Menu"),
      h("button", { class: "btn primary", type: "button", "data-testid": "next-puzzle", onclick: () => info.onNext() }, "Next puzzle", svgIcon(ICONS.next)),
    ),
  );
  host.append(h("div", { class: "win-overlay" }, card));
}
