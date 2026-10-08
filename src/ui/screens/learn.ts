/**
 * Learn: rules and every technique the hint engine uses, grouped by puzzle and tier, with how to
 * spot it, why it works, and how often hints have shown it to you. Opens as an overlay so it can
 * be read mid-game without losing the board.
 */
import { SUDOKU_CATALOG } from "../../engine/catalog";
import { TIER_NAMES, type TechniqueFamily, type TechniqueInfo } from "../../engine/hint-types";
import { QUEENS_RULES, QUEENS_TECHNIQUES } from "../../engine/queens/catalog";
import { hasExample, loadExamples, renderExample } from "../components/example";
import { h, svgIcon } from "../dom";
import { ICONS } from "../icons";
import { sound } from "../sound";
import { loadProgress } from "../store";

const RULES: Record<TechniqueFamily, string[]> = {
  sudoku: [
    "Fill every empty cell with a digit from 1 to 9.",
    "Each row, each column and each 3×3 box must contain every digit exactly once.",
    "Every puzzle here has exactly one solution, and you never need to guess.",
  ],
  killer: [
    "All the sudoku rules apply: each row, column and 3×3 box holds 1–9 once.",
    "The dashed shapes are cages. The digits in a cage add up to its small number.",
    "A digit never repeats inside a cage.",
    "There are usually no starting digits — the cage sums are the clues.",
  ],
  queens: QUEENS_RULES,
};

const TABS: { id: TechniqueFamily; label: string }[] = [
  { id: "sudoku", label: "Sudoku" },
  { id: "killer", label: "Killer" },
  { id: "queens", label: "Queens" },
];

function entries(family: TechniqueFamily): TechniqueInfo[] {
  const list = family === "queens" ? QUEENS_TECHNIQUES : SUDOKU_CATALOG.filter((t) => t.family === family);
  return [...list].sort((a, b) => a.tier - b.tier || a.rating - b.rating);
}

export function openLearn(focus?: string): void {
  sound.ui("open");
  const progress = loadProgress();
  const initial: TechniqueFamily = focus
    ? ((SUDOKU_CATALOG.find((t) => t.id === focus)?.family ?? (QUEENS_TECHNIQUES.some((t) => t.id === focus) ? "queens" : "sudoku")) as TechniqueFamily)
    : "sudoku";
  const content = h("div", { class: "learn-content" });
  const tabButtons = TABS.map((t) =>
    h("button", { class: "tab", type: "button", role: "tab", "data-tab": t.id, onclick: () => show(t.id) }, t.label),
  );

  const card = (t: TechniqueInfo): HTMLElement => {
    const seen = progress.hinted[t.id] ?? 0;
    const details = h(
      "details",
      { class: `tech tier-${t.tier}`, id: `tech-${t.id}`, "data-technique": t.id },
      h(
        "summary",
        null,
        h("div", { class: "tech-pips", "aria-label": `Tier ${t.tier}` }, ...[1, 2, 3, 4, 5].map((i) => h("i", { class: i <= t.tier ? "on" : "" }))),
        h("div", { class: "tech-name" }, h("b", null, t.name), h("small", null, `${TIER_NAMES[t.tier] ?? ""}${seen ? ` · seen in ${seen} hint${seen === 1 ? "" : "s"}` : ""}`)),
      ),
      h("p", { class: "tech-summary" }, t.summary),
      h("h4", null, "How to spot it"),
      h("p", null, t.spot),
      h("h4", null, "Why it works"),
      h("p", null, t.why),
      t.tip ? h("p", { class: "tip" }, h("b", null, "Tip: "), t.tip) : null,
      t.aka?.length ? h("p", { class: "aka" }, `Also called: ${t.aka.join(", ")}`) : null,
    );
    // A real position from the packs, drawn with the hint visuals (loaded lazily).
    void loadExamples().then((ex) => {
      if (!ex || !hasExample(ex, t.id, t.family)) return;
      const slot = h("div", { class: "example-slot" });
      const btn = h(
        "button",
        {
          class: "btn ghost example-btn",
          type: "button",
          "data-testid": `example-${t.id}`,
          onclick: () => {
            sound.ui("open");
            slot.replaceChildren(renderExample(ex, t.id, t.family));
            btn.remove();
          },
        },
        svgIcon(ICONS.sparkle),
        "See it on a real board",
      );
      details.append(btn, slot);
      if (details.classList.contains("focus") && details.open) btn.click();
    });
    return details;
  };

  const show = (family: TechniqueFamily) => {
    for (const b of tabButtons) b.setAttribute("aria-selected", String(b.dataset.tab === family));
    const tiers = new Map<number, TechniqueInfo[]>();
    for (const t of entries(family)) tiers.set(t.tier, [...(tiers.get(t.tier) ?? []), t]);
    content.replaceChildren(
      h("section", { class: "rules" }, h("h3", null, "How to play"), h("ul", null, ...RULES[family].map((r) => h("li", null, r)))),
      ...[...tiers.entries()].map(([tier, list]) =>
        h("section", { class: "tier-group" }, h("h3", null, `${TIER_NAMES[tier] ?? `Tier ${tier}`}`), ...list.map(card)),
      ),
    );
  };

  const close = () => {
    sound.ui("close");
    overlay.classList.add("closing");
    overlay.addEventListener("animationend", () => overlay.remove(), { once: true });
    removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
  addEventListener("keydown", onKey);

  const overlay = h(
    "div",
    { class: "overlay learn", role: "dialog", "aria-label": "Learn techniques", "data-testid": "learn" },
    h(
      "header",
      { class: "sheet-head" },
      h("h2", null, "Learn"),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Close", onclick: close }, svgIcon(ICONS.close)),
    ),
    h("nav", { class: "tabs", role: "tablist" }, ...tabButtons),
    content,
  );
  document.body.append(overlay);
  show(initial);
  if (focus) {
    const el = overlay.querySelector<HTMLDetailsElement>(`#tech-${CSS.escape(focus)}`);
    if (el) {
      el.open = true;
      el.classList.add("focus");
      requestAnimationFrame(() => el.scrollIntoView({ block: "center" }));
    }
  }
}
