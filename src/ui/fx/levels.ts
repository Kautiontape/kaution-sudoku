/**
 * Level entrances: eight themed ways for a new board to arrive, each with a matching exit for the
 * solved board before it. They rotate — every style once per round, never the same twice in a row
 * — so each level lands differently.
 *
 *   Warp      the solved board rushes past you; the next one zooms up out of deep space
 *   Rain      squares drop in from above and stack from the bottom row up, Tetris-style
 *   Ripple    squares well up in rings from one point, like a stone dropped in water
 *   Deal      squares flip over diagonally from the top-left, like dealt cards
 *   Vortex    squares spin in along a spiral from the edge to the centre as the board unwinds
 *   Shards    squares fly in from everywhere and lock together
 *   Hologram  a scanline projects the board row by row, with a flicker as it settles
 *   Nova      a flash at the centre blooms outward into the board
 *
 * Everything runs on the Web Animations API (transform, opacity, filter, clip-path — nothing that
 * changes layout) plus a little FX, so input is never blocked: the cells are live the whole time.
 * Calm effects and prefers-reduced-motion get a short fade instead.
 */
import { h, reducedMotion } from "../dom";
import { hexToRgb } from "../palette";
import { settings } from "../settings";
import { sound } from "../sound";
import type { Background } from "./background";
import { callout } from "./callout";
import { createStyleBag, spiralOrder } from "./level-order";
import type { Fx } from "./particles";

/** A board as the transitions see it. */
export interface Stage {
  /** The board as one piece. */
  wrap: HTMLElement;
  /** The element that clips the cells. */
  grid: HTMLElement;
  /** Cells, row-major. */
  cells: HTMLElement[];
  /** Side length in cells. */
  n: number;
  /** Layers over the cells (sudoku's grid lines, cages, sums), faded in after them. */
  overlays: Element[];
  /** See-through cells (sudoku): lit as glowing tiles while they travel. */
  tiles: boolean;
}

export interface StageKit {
  fx: Fx;
  bg: Background;
}

interface Ctx extends StageKit {
  s: Stage;
  /** The board's box before anything moves. */
  rect: DOMRect;
  cx: number;
  cy: number;
  /** Cell size in px. */
  cell: number;
  color: string;
  color2: string;
}

export interface LevelStyle {
  id: string;
  name: string;
  /** Bring a new board in; returns ms until it has landed. */
  enter(c: Ctx): number;
  /** Send the solved board off; returns ms. It stays hidden afterwards (the next screen replaces it). */
  exit(c: Ctx): number;
}

// ------------------------------------------------------------------------------------------
// Helpers

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const rowOf = (c: Ctx, i: number) => Math.floor(i / c.s.n);
const colOf = (c: Ctx, i: number) => i % c.s.n;

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Entrance keyframes run "backwards" (hidden during their delay); exits hold their last frame. */
function play(el: Element, frames: Keyframe[], o: KeyframeAnimationOptions): void {
  el.animate(frames, { fill: "backwards", ...o });
}

/** A travelling cell's glow: sudoku cells light up as tiles, queens cells flare brighter. */
function glow(c: Ctx, on: boolean): Keyframe {
  if (c.s.tiles)
    return {
      boxShadow: on ? `inset 0 0 0 2px ${rgba(c.color, 0.95)}, inset 0 0 18px ${rgba(c.color, 0.6)}` : `inset 0 0 0 0 ${rgba(c.color, 0)}, inset 0 0 0 0 ${rgba(c.color, 0)}`,
      backgroundColor: on ? rgba(c.color, 0.22) : rgba(c.color, 0),
    };
  return { filter: on ? "brightness(1.9) saturate(1.3)" : "brightness(1) saturate(1)" };
}

function overlaysIn(c: Ctx, delay: number, duration = 380): void {
  for (const o of c.s.overlays) play(o, [{ opacity: 0 }, { opacity: 1 }], { duration, delay, easing: "ease-out" });
}

function overlaysOut(c: Ctx, duration = 200): void {
  for (const o of c.s.overlays) play(o, [{ opacity: 1 }, { opacity: 0 }], { duration, easing: "ease-in", fill: "forwards" });
}

/** Let cells travel outside the board's rounded clip for `ms`. */
function unclip(c: Ctx, ms: number): void {
  c.s.grid.classList.add("staging");
  window.setTimeout(() => c.s.grid.classList.remove("staging"), ms + 60);
}

const at = (ms: number, fn: () => void) => window.setTimeout(fn, ms);

/** Stars streaming out from the centre (warp). */
function starfield(c: Ctx, from: number, to: number): void {
  for (let t = from; t < to; t += 70)
    at(t, () => {
      c.fx.burst(c.cx, c.cy, "#ffffff", { count: 10, speed: 1300, size: 3.5, life: 0.4, gravity: 0 });
      c.fx.burst(c.cx, c.cy, c.color, { count: 6, speed: 1000, size: 4, life: 0.45, gravity: 0 });
    });
}

/** Board box with the board's own animations stripped, so FX land where it will be. */
function boardRect(s: Stage): DOMRect {
  for (const a of s.wrap.getAnimations()) a.cancel();
  return s.wrap.getBoundingClientRect();
}

// ------------------------------------------------------------------------------------------
// The eight styles

const warp: LevelStyle = {
  id: "warp",
  name: "Warp",
  enter(c) {
    const D = 860;
    play(
      c.s.wrap,
      [
        { transform: "scale(0.04)", opacity: 0, filter: "blur(14px) brightness(3)" },
        { opacity: 1, offset: 0.22 },
        { transform: "scale(1.06)", filter: "blur(0px) brightness(1.5)", offset: 0.78 },
        { transform: "scale(1)", opacity: 1, filter: "blur(0px) brightness(1)" },
      ],
      { duration: D, easing: "cubic-bezier(0.25, 0.8, 0.25, 1)" },
    );
    starfield(c, 0, D * 0.6);
    at(D * 0.78, () => {
      c.fx.ring(c.cx, c.cy, c.color, c.rect.width * 0.72, 0.7, 3);
      c.bg.pulse(c.cx, c.cy, c.color, 1.6);
    });
    return D;
  },
  exit(c) {
    const D = 460;
    play(
      c.s.wrap,
      [
        { transform: "scale(1)", opacity: 1, filter: "blur(0px) brightness(1)" },
        { transform: "scale(2.9)", opacity: 0, filter: "blur(10px) brightness(2.6)" },
      ],
      { duration: D, easing: "cubic-bezier(0.6, 0, 0.9, 0.4)", fill: "forwards" },
    );
    starfield(c, 0, D);
    return D;
  },
};

const rain: LevelStyle = {
  id: "rain",
  name: "Rain",
  enter(c) {
    const n = c.s.n;
    const ROW = 55;
    const DUR = 540;
    let end = 0;
    c.s.cells.forEach((el, i) => {
      const r = rowOf(c, i);
      const delay = (n - 1 - r) * ROW + colOf(c, i) * 14 + rand(0, 40);
      const from = -(c.rect.top + (r + 2) * c.cell);
      play(
        el,
        [
          { transform: `translateY(${from}px)`, opacity: 0, easing: "cubic-bezier(0.5, 0, 0.9, 0.5)", ...glow(c, true) },
          { opacity: 1, offset: 0.2 },
          { transform: "translateY(0px) scaleY(0.84)", offset: 0.8, easing: "ease-out" },
          { transform: "translateY(-6%) scaleY(1.04)", offset: 0.9 },
          { transform: "translateY(0px) scaleY(1)", opacity: 1, ...glow(c, false) },
        ],
        { duration: DUR, delay },
      );
      end = Math.max(end, delay + DUR);
    });
    // Each row kicks up a little dust as it lands.
    for (let r = 0; r < n; r++)
      at((n - 1 - r) * ROW + DUR * 0.8 + 70, () => {
        const y = c.rect.top + (r + 1) * c.cell;
        c.fx.streak(c.rect.left, y, c.rect.right, y, c.color, 7);
      });
    overlaysIn(c, 0, 260);
    unclip(c, end);
    return end;
  },
  exit(c) {
    const n = c.s.n;
    const drop = innerHeight - c.rect.top + c.cell;
    let end = 0;
    c.s.cells.forEach((el, i) => {
      const delay = (n - 1 - rowOf(c, i)) * 32 + rand(0, 70);
      play(el, [{ transform: "translateY(0px) rotate(0deg)", opacity: 1 }, { transform: `translateY(${drop}px) rotate(${rand(-30, 30)}deg)`, opacity: 0.3 }], {
        duration: 520,
        delay,
        easing: "cubic-bezier(0.55, 0, 1, 0.45)",
        fill: "forwards",
      });
      end = Math.max(end, delay + 520);
    });
    overlaysOut(c);
    play(c.s.wrap, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, delay: end - 220, fill: "forwards" });
    unclip(c, end);
    return end;
  },
};

const ripple: LevelStyle = {
  id: "ripple",
  name: "Ripple",
  enter(c) {
    const n = c.s.n;
    const or = Math.floor(rand(0, n));
    const oc = Math.floor(rand(0, n));
    const DUR = 560;
    let end = 0;
    c.s.cells.forEach((el, i) => {
      const delay = Math.hypot(rowOf(c, i) - or, colOf(c, i) - oc) * 62;
      play(
        el,
        [
          { transform: "scale(0.15)", opacity: 0, ...glow(c, true) },
          { transform: "scale(1.14)", opacity: 1, offset: 0.55 },
          { transform: "scale(0.97)", offset: 0.8 },
          { transform: "scale(1)", opacity: 1, ...glow(c, false) },
        ],
        { duration: DUR, delay, easing: "ease-out" },
      );
      end = Math.max(end, delay + DUR);
    });
    const x = c.rect.left + (oc + 0.5) * c.cell;
    const y = c.rect.top + (or + 0.5) * c.cell;
    for (let k = 0; k < 3; k++) at(k * 160, () => c.fx.ring(x, y, k === 1 ? c.color2 : c.color, c.rect.width * (0.6 + k * 0.25), 0.9, 3 - k * 0.6));
    c.bg.pulse(x, y, c.color, 1.3);
    overlaysIn(c, 180);
    return end;
  },
  exit(c) {
    const n = c.s.n;
    const or = Math.floor(rand(0, n));
    const oc = Math.floor(rand(0, n));
    let end = 0;
    c.s.cells.forEach((el, i) => {
      const delay = Math.hypot(rowOf(c, i) - or, colOf(c, i) - oc) * 36;
      play(el, [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0.1)", opacity: 0 }], { duration: 320, delay, easing: "ease-in", fill: "forwards" });
      end = Math.max(end, delay + 320);
    });
    c.fx.ring(c.rect.left + (oc + 0.5) * c.cell, c.rect.top + (or + 0.5) * c.cell, c.color, c.rect.width * 0.7, 0.6, 2);
    overlaysOut(c);
    return end;
  },
};

const deal: LevelStyle = {
  id: "deal",
  name: "Deal",
  enter(c) {
    const STEP = 34;
    const DUR = 600;
    let end = 0;
    c.s.cells.forEach((el, i) => {
      const delay = (rowOf(c, i) + colOf(c, i)) * STEP;
      play(
        el,
        [
          { transform: "perspective(600px) rotateY(-110deg) scale(0.9)", opacity: 0, ...glow(c, true) },
          { opacity: 1, offset: 0.3 },
          { transform: "perspective(600px) rotateY(12deg) scale(1.02)", offset: 0.72 },
          { transform: "perspective(600px) rotateY(0deg) scale(1)", opacity: 1, ...glow(c, false) },
        ],
        { duration: DUR, delay, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" },
      );
      end = Math.max(end, delay + DUR);
    });
    overlaysIn(c, end * 0.35);
    at(end - 120, () => c.fx.streak(c.rect.left, c.rect.top, c.rect.right, c.rect.bottom, c.color, 18));
    return end;
  },
  exit(c) {
    let end = 0;
    c.s.cells.forEach((el, i) => {
      const delay = (rowOf(c, i) + colOf(c, i)) * 18;
      play(el, [{ transform: "perspective(600px) rotateY(0deg)", opacity: 1 }, { transform: "perspective(600px) rotateY(100deg)", opacity: 0 }], {
        duration: 320,
        delay,
        easing: "ease-in",
        fill: "forwards",
      });
      end = Math.max(end, delay + 320);
    });
    overlaysOut(c);
    return end;
  },
};

const vortex: LevelStyle = {
  id: "vortex",
  name: "Vortex",
  enter(c) {
    const rank = spiralOrder(c.s.n);
    const per = 900 / (c.s.n * c.s.n);
    const DUR = 520;
    c.s.cells.forEach((el, i) =>
      play(
        el,
        [
          { transform: "rotate(-220deg) scale(0)", opacity: 0, ...glow(c, true) },
          { transform: "rotate(14deg) scale(1.08)", opacity: 1, offset: 0.7 },
          { transform: "rotate(0deg) scale(1)", opacity: 1, ...glow(c, false) },
        ],
        { duration: DUR, delay: rank[i]! * per, easing: "ease-out" },
      ),
    );
    const end = 900 + DUR;
    play(c.s.wrap, [{ transform: "rotate(-18deg) scale(0.9)" }, { transform: "rotate(0deg) scale(1)" }], { duration: end, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" });
    overlaysIn(c, end * 0.45);
    at(end - 100, () => {
      c.fx.ring(c.cx, c.cy, c.color2, c.rect.width * 0.55, 0.7, 3);
      c.bg.pulse(c.cx, c.cy, c.color2, 1.2);
    });
    return end;
  },
  exit(c) {
    const D = 520;
    play(
      c.s.wrap,
      [
        { transform: "rotate(0deg) scale(1)", opacity: 1, filter: "blur(0px)" },
        { transform: "rotate(200deg) scale(0)", opacity: 0, filter: "blur(4px)" },
      ],
      { duration: D, easing: "cubic-bezier(0.6, 0, 0.9, 0.5)", fill: "forwards" },
    );
    at(D * 0.8, () => c.fx.burst(c.cx, c.cy, c.color2, { count: 24, speed: 260, size: 6, life: 0.6, gravity: 0 }));
    return D;
  },
};

const shards: LevelStyle = {
  id: "shards",
  name: "Shards",
  enter(c) {
    const DUR = 700;
    let end = 0;
    c.s.cells.forEach((el) => {
      const a = rand(0, Math.PI * 2);
      const d = c.rect.width * rand(0.6, 1.2);
      const delay = rand(0, 260);
      play(
        el,
        [
          { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) rotate(${rand(-260, 260)}deg) scale(0.4)`, opacity: 0, ...glow(c, true) },
          { opacity: 1, offset: 0.25 },
          { transform: "translate(0px, 0px) rotate(0deg) scale(1.06)", offset: 0.8 },
          { transform: "translate(0px, 0px) rotate(0deg) scale(1)", opacity: 1, ...glow(c, false) },
        ],
        { duration: DUR, delay, easing: "cubic-bezier(0.16, 0.84, 0.3, 1)" },
      );
      end = Math.max(end, delay + DUR);
    });
    unclip(c, end);
    overlaysIn(c, end * 0.6, 260);
    at(end * 0.82, () => {
      c.fx.ring(c.cx, c.cy, "#ffffff", c.rect.width * 0.8, 0.5, 2);
      c.fx.burst(c.cx, c.cy, c.color, { count: 30, speed: 420, size: 6, life: 0.6, gravity: 0 });
      c.bg.pulse(c.cx, c.cy, c.color, 1.4);
    });
    return end;
  },
  exit(c) {
    let end = 0;
    c.s.cells.forEach((el, i) => {
      const dx = (colOf(c, i) + 0.5) * c.cell - c.rect.width / 2;
      const dy = (rowOf(c, i) + 0.5) * c.cell - c.rect.height / 2;
      const len = Math.hypot(dx, dy) || 1;
      const d = c.rect.width * rand(0.7, 1.3);
      const delay = rand(0, 100);
      play(
        el,
        [
          { transform: "translate(0px, 0px) rotate(0deg) scale(1)", opacity: 1 },
          { transform: `translate(${(dx / len) * d}px, ${(dy / len) * d}px) rotate(${rand(-220, 220)}deg) scale(0.5)`, opacity: 0 },
        ],
        { duration: 500, delay, easing: "cubic-bezier(0.5, 0, 0.9, 0.6)", fill: "forwards" },
      );
      end = Math.max(end, delay + 500);
    });
    c.fx.burst(c.cx, c.cy, "#ffffff", { count: 26, speed: 520, size: 5, life: 0.5, gravity: 0 });
    overlaysOut(c);
    unclip(c, end);
    return end;
  },
};

/** A bright line sweeping over the board (hologram). */
function scanline(c: Ctx, from: number, to: number, duration: number): void {
  const line = h("div", { class: "scanline", "aria-hidden": "true" });
  c.s.wrap.append(line);
  line.animate([{ transform: `translateY(${from}px)` }, { transform: `translateY(${to}px)` }], { duration, easing: "linear" }).finished.then(
    () => line.remove(),
    () => line.remove(),
  );
}

const hologram: LevelStyle = {
  id: "hologram",
  name: "Hologram",
  enter(c) {
    const n = c.s.n;
    const SCAN = 780;
    const DUR = 420;
    scanline(c, -4, c.rect.height, SCAN);
    c.s.cells.forEach((el, i) => {
      const delay = Math.max(0, ((rowOf(c, i) + 0.5) / n) * SCAN - 110);
      play(
        el,
        [
          { opacity: 0, transform: `scaleY(0.08) translateX(${rand(-10, 10)}px)`, ...glow(c, true), ...(c.s.tiles ? {} : { filter: "brightness(3) saturate(0.4)" }) },
          { opacity: 0.75, transform: "scaleY(1.06) translateX(0px)", offset: 0.5 },
          { opacity: 1, transform: "scaleY(1) translateX(0px)", ...glow(c, false) },
        ],
        { duration: DUR, delay, easing: "ease-out" },
      );
    });
    overlaysIn(c, 0, SCAN);
    // The projection catches as it settles.
    play(c.s.wrap, [{ opacity: 1 }, { opacity: 0.7, offset: 0.25 }, { opacity: 1, offset: 0.45 }, { opacity: 0.85, offset: 0.7 }, { opacity: 1 }], { duration: 280, delay: SCAN });
    return SCAN + 280;
  },
  exit(c) {
    const n = c.s.n;
    const SCAN = 420;
    scanline(c, c.rect.height, -4, SCAN);
    c.s.cells.forEach((el, i) => {
      const delay = ((n - 1 - rowOf(c, i) + 0.5) / n) * SCAN - 60;
      play(el, [{ opacity: 1, transform: "scaleY(1)" }, { opacity: 0, transform: "scaleY(0.05)" }], { duration: 220, delay: Math.max(0, delay), easing: "ease-in", fill: "forwards" });
    });
    overlaysOut(c, SCAN);
    return SCAN + 120;
  },
};

const nova: LevelStyle = {
  id: "nova",
  name: "Nova",
  enter(c) {
    const D = 780;
    play(
      c.s.wrap,
      [
        { clipPath: "circle(0% at 50% 50%)", filter: "brightness(4) saturate(0.2)" },
        { clipPath: "circle(38% at 50% 50%)", filter: "brightness(2.2) saturate(0.8)", offset: 0.4 },
        { clipPath: "circle(75% at 50% 50%)", filter: "brightness(1) saturate(1)" },
      ],
      { duration: D, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" },
    );
    c.fx.burst(c.cx, c.cy, "#ffffff", { count: 60, speed: 560, size: 7, life: 0.9, gravity: 0 });
    c.fx.ring(c.cx, c.cy, "#ffffff", c.rect.width * 0.5, 0.6, 4);
    at(140, () => c.fx.ring(c.cx, c.cy, c.color, c.rect.width * 0.9, 0.9, 3));
    c.bg.pulse(c.cx, c.cy, "#ffffff", 2.2);
    return D;
  },
  exit(c) {
    const D = 420;
    play(
      c.s.wrap,
      [
        { clipPath: "circle(75% at 50% 50%)", filter: "brightness(1)" },
        { clipPath: "circle(0% at 50% 50%)", filter: "brightness(3)" },
      ],
      { duration: D, easing: "cubic-bezier(0.6, 0, 0.9, 0.5)", fill: "forwards" },
    );
    at(D - 40, () => {
      c.fx.burst(c.cx, c.cy, "#ffffff", { count: 30, speed: 300, size: 6, life: 0.5, gravity: 0 });
      c.fx.ring(c.cx, c.cy, c.color, c.rect.width * 0.4, 0.4, 3);
    });
    return D;
  },
};

export const LEVEL_STYLES: readonly LevelStyle[] = [warp, rain, ripple, deal, vortex, shards, hologram, nova];

// ------------------------------------------------------------------------------------------
// Rotation and the public calls

const bag = createStyleBag(LEVEL_STYLES.length);
let coming: number | null = null;

/** ?entrance=nova pins one style (for previewing a style, and for tests). */
function pinned(): number | null {
  const id = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("entrance");
  const i = LEVEL_STYLES.findIndex((s) => s.id === id);
  return i >= 0 ? i : null;
}

const nextStyle = (): number => pinned() ?? bag.next();

const calm = () => settings().effects === "low" || reducedMotion();

function context(s: Stage, kit: StageKit): Ctx {
  const rect = boardRect(s);
  const css = getComputedStyle(document.documentElement);
  return {
    ...kit,
    s,
    rect,
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    cell: rect.width / s.n,
    color: css.getPropertyValue("--a1").trim() || "#7cf3ff",
    color2: css.getPropertyValue("--a2").trim() || "#a98bff",
  };
}

/** Send the solved board off in the style the next level will arrive in. Returns ms. */
export function leaveLevel(s: Stage, kit: StageKit): number {
  coming = nextStyle();
  if (calm()) {
    play(s.wrap, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" });
    return 200;
  }
  return LEVEL_STYLES[coming]!.exit(context(s, kit));
}

/**
 * Bring a level's board in (in the style leaveLevel picked, or the next in the rotation), with
 * its number called out as it lands. Returns the style and ms until it has landed.
 */
export function enterLevel(s: Stage, kit: StageKit, level: number): { style: LevelStyle; ms: number } {
  const i = coming ?? nextStyle();
  coming = null;
  const style = LEVEL_STYLES[i]!;
  if (calm()) {
    play(s.wrap, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
    return { style, ms: 260 };
  }
  const c = context(s, kit);
  const ms = style.enter(c);
  sound.level(i);
  at(Math.min(ms * 0.7, 700), () => callout(`LEVEL ${level}`, { size: "small", sub: style.name, color: c.color, y: c.rect.top + c.rect.height * 0.46 }));
  return { style, ms };
}
