/**
 * Killer cage outlines: trace the boundary of a set of grid cells as closed loops and inset them
 * so neighbouring cages read as separate dashed shapes. Coordinates are in cell units (0..9).
 */
import type { CellId } from "../../engine/types";

type Pt = [number, number];

/** Closed loops (clockwise on screen) around the given cells, collinear points merged. */
export function cageLoops(cells: readonly CellId[], cols = 9): Pt[][] {
  const inCage = new Set(cells);
  const has = (r: number, c: number) => r >= 0 && c >= 0 && c < cols && inCage.has(r * cols + c);
  // Directed boundary edges with the cage on the right-hand side (clockwise in y-down coords).
  const edges = new Map<string, Pt[]>();
  const add = (a: Pt, b: Pt) => {
    const k = `${a[0]},${a[1]}`;
    edges.set(k, [...(edges.get(k) ?? []), b]);
  };
  for (const cell of cells) {
    const r = Math.floor(cell / cols);
    const c = cell % cols;
    if (!has(r - 1, c)) add([c, r], [c + 1, r]);
    if (!has(r, c + 1)) add([c + 1, r], [c + 1, r + 1]);
    if (!has(r + 1, c)) add([c + 1, r + 1], [c, r + 1]);
    if (!has(r, c - 1)) add([c, r + 1], [c, r]);
  }
  const loops: Pt[][] = [];
  const take = (from: Pt, dir: Pt | null): Pt | null => {
    const k = `${from[0]},${from[1]}`;
    const outs = edges.get(k);
    if (!outs?.length) return null;
    let idx = 0;
    if (outs.length > 1 && dir) {
      // At a pinch point, turn right (hug the same cell) to keep loops simple.
      const right: Pt = [-dir[1], dir[0]];
      const found = outs.findIndex((o) => o[0] - from[0] === right[0] && o[1] - from[1] === right[1]);
      if (found >= 0) idx = found;
    }
    const [next] = outs.splice(idx, 1);
    if (!outs.length) edges.delete(k);
    return next!;
  };
  while (edges.size) {
    const startKey = edges.keys().next().value as string;
    const start = startKey.split(",").map(Number) as Pt;
    const loop: Pt[] = [start];
    let cur = start;
    let dir: Pt | null = null;
    for (let guard = 0; guard < 400; guard++) {
      const next = take(cur, dir);
      if (!next) break;
      dir = [next[0] - cur[0], next[1] - cur[1]];
      if (next[0] === start[0] && next[1] === start[1]) break;
      loop.push(next);
      cur = next;
    }
    loops.push(simplify(loop));
  }
  return loops;
}

function simplify(loop: Pt[]): Pt[] {
  const n = loop.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = loop[(i - 1 + n) % n]!;
    const cur = loop[i]!;
    const next = loop[(i + 1) % n]!;
    const d1: Pt = [cur[0] - prev[0], cur[1] - prev[1]];
    const d2: Pt = [next[0] - cur[0], next[1] - cur[1]];
    if (d1[0] * d2[1] - d1[1] * d2[0] !== 0) out.push(cur);
  }
  return out;
}

/** Move every corner of a clockwise loop inward by `m` (in the same units). */
export function insetLoop(loop: Pt[], m: number): Pt[] {
  const n = loop.length;
  return loop.map((cur, i) => {
    const prev = loop[(i - 1 + n) % n]!;
    const next = loop[(i + 1) % n]!;
    const din = norm([cur[0] - prev[0], cur[1] - prev[1]]);
    const dout = norm([next[0] - cur[0], next[1] - cur[1]]);
    // Right-hand normal in y-down coordinates: (-dy, dx).
    const nin: Pt = [-din[1], din[0]];
    const nout: Pt = [-dout[1], dout[0]];
    return [cur[0] + m * (nin[0] + nout[0]), cur[1] + m * (nin[1] + nout[1])] as Pt;
  });
}

function norm(v: [number, number]): Pt {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

/** SVG path data for a cage, inset by `m` cells, scaled by `unit`. */
export function cagePath(cells: readonly CellId[], m: number, unit: number, cols = 9): string {
  return cageLoops(cells, cols)
    .map((loop) => insetLoop(loop, m))
    .map((loop) => `M${loop.map(([x, y]) => `${(x * unit).toFixed(1)} ${(y * unit).toFixed(1)}`).join("L")}Z`)
    .join("");
}

/** Greedy graph colouring of cages so neighbours differ (for subtle tints). */
export function colorCages(cages: readonly { cells: readonly CellId[] }[], colors: number, cols = 9): number[] {
  const owner = new Map<CellId, number>();
  cages.forEach((cg, i) => cg.cells.forEach((c) => owner.set(c, i)));
  const neighbors = cages.map((cg, i) => {
    const set = new Set<number>();
    for (const c of cg.cells) {
      const r = Math.floor(c / cols);
      const k = c % cols;
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const rr = r + dr;
        const cc = k + dc;
        if (rr < 0 || cc < 0 || rr >= cols || cc >= cols) continue;
        const o = owner.get(rr * cols + cc);
        if (o !== undefined && o !== i) set.add(o);
      }
    }
    return set;
  });
  const out = new Array<number>(cages.length).fill(-1);
  const order = cages.map((_, i) => i).sort((a, b) => neighbors[b]!.size - neighbors[a]!.size);
  for (const i of order) {
    const used = new Set([...neighbors[i]!].map((j) => out[j]));
    let c = 0;
    while (used.has(c) && c < colors - 1) c++;
    out[i] = c;
  }
  return out;
}
