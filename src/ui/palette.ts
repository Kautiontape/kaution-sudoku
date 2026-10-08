/**
 * Colour language. Each mode has a "stage" theme (Tetris Effect style: one mood per stage), and
 * digits 1–9 always keep the same hue so a 7 feels like a 7 everywhere.
 */
export type ThemeName = "prism" | "abyss" | "ember" | "aurora";

export interface Theme {
  name: ThemeName;
  /** Accent colours, brightest first. */
  accents: [string, string, string];
  /** Nebula blobs drawn by the background. */
  blobs: string[];
  /** Deep base colour behind everything. */
  base: string;
}

export const THEMES: Record<ThemeName, Theme> = {
  prism: {
    name: "prism",
    accents: ["#7cf3ff", "#a98bff", "#ff7ad9"],
    blobs: ["#1d6dff", "#7a3cff", "#ff3fae", "#00c2d8", "#3b1d8f"],
    base: "#03040c",
  },
  abyss: {
    name: "abyss",
    accents: ["#43ecff", "#4f86ff", "#a77dff"],
    blobs: ["#0a63ff", "#00b3d6", "#5a2dff", "#0b2a8f", "#00e0c0"],
    base: "#02040d",
  },
  ember: {
    name: "ember",
    accents: ["#ff62d3", "#ff9a4d", "#ffd35e"],
    blobs: ["#ff2d8a", "#ff7a1a", "#8a1cff", "#c2003d", "#ffb02e"],
    base: "#070309",
  },
  aurora: {
    name: "aurora",
    accents: ["#5dffbb", "#3fd3ff", "#b98bff"],
    blobs: ["#00d68a", "#00a8e0", "#7a3cff", "#00f0c8", "#2b4dff"],
    base: "#020807",
  },
};

/** Digit hues 1..9 (index 0 unused): a full spectrum, tuned for legibility on near-black. */
export const DIGIT_COLORS = ["#ffffff", "#ff6f91", "#ffa25c", "#ffd862", "#bdf65f", "#52f2ad", "#4ee5ff", "#62a6ff", "#a184ff", "#f274ff"];

/** Hint mark colours (SudokuWiki-style roles). */
export const MARK_COLORS: Record<string, string> = {
  place: "#3dff9a",
  elim: "#ff4d6d",
  key: "#46d9ff",
  alt: "#ffc94a",
  on: "#7dff6a",
  off: "#c58bff",
  digit: "#8f9bc4",
};

/** Queens region colours, chosen to stay distinct from each other on a dark board. */
export const REGION_COLORS: { color: string; name: string }[] = [
  { color: "#ff6f9c", name: "pink" },
  { color: "#ff9f4a", name: "orange" },
  { color: "#ffd84d", name: "yellow" },
  { color: "#7fe35c", name: "green" },
  { color: "#33d6c0", name: "teal" },
  { color: "#4aa8ff", name: "blue" },
  { color: "#9b7dff", name: "violet" },
  { color: "#e86cf5", name: "magenta" },
  { color: "#d9b38c", name: "sand" },
  { color: "#a9bdd6", name: "silver" },
  { color: "#ff5a52", name: "red" },
];

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function applyTheme(t: ThemeName): void {
  const theme = THEMES[t];
  const root = document.documentElement;
  root.dataset.theme = t;
  root.style.setProperty("--a1", theme.accents[0]);
  root.style.setProperty("--a2", theme.accents[1]);
  root.style.setProperty("--a3", theme.accents[2]);
  root.style.setProperty("--base", theme.base);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.base);
}
