/**
 * Simple colouring (single digit). Join every pair of cells that are the only two places for d in
 * some row, column or box; give the cells of each connected cluster two colours, alternating
 * across the pairs. Exactly one colour holds d (in all its cells).
 *
 * - Colour wrap: two cells of the same colour see each other, so that colour can't be the true
 *   one: none of its cells is d.
 * - Colour trap: a cell outside the cluster that sees a cell of each colour sees a d either way.
 */
import type { SolverState } from "../state";
import type { CellId, ChainLink, Digit, Elimination, House, Step } from "../types";
import { conjugatePairs, housePositions, openDigits, sharedHouse, withContext } from "./links";
import type { Technique } from "./types";
import { bit, elimMarks, house, makeStep, marksFor, sees } from "./util";

interface Edge {
  a: CellId;
  b: CellId;
  house: number;
}

interface Cluster {
  /** Colour 0 (contains the cluster's first cell), colour 1. Sorted. */
  colors: [CellId[], CellId[]];
  /** BFS tree edges, in discovery order. */
  edges: Edge[];
}

/** Two-coloured clusters of the conjugate-pair graph on d, in order of their first cell. */
function clusters(s: SolverState, d: Digit, pos: Uint16Array): Cluster[] {
  const adj = new Map<CellId, Edge[]>();
  for (const e of conjugatePairs(s, d, pos)) {
    adj.set(e.a, [...(adj.get(e.a) ?? []), e]);
    adj.set(e.b, [...(adj.get(e.b) ?? []), { a: e.b, b: e.a, house: e.house }]);
  }
  const color = new Int8Array(81).fill(-1);
  const out: Cluster[] = [];
  for (const start of [...adj.keys()].sort((x, y) => x - y)) {
    if (color[start]! >= 0) continue;
    color[start] = 0;
    const queue = [start];
    const members = [start];
    const edges: Edge[] = [];
    let consistent = true;
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i]!;
      for (const e of adj.get(c)!) {
        if (color[e.b]! < 0) {
          color[e.b] = 1 - color[c]!;
          edges.push({ a: c, b: e.b, house: e.house });
          members.push(e.b);
          queue.push(e.b);
        } else if (color[e.b] === color[c]) consistent = false;
      }
    }
    // An odd loop of strong links is a contradiction (only possible from bad notes): don't colour it.
    if (!consistent) continue;
    const byColor = (k: number) => members.filter((c) => color[c] === k).sort((x, y) => x - y);
    out.push({ colors: [byColor(0), byColor(1)], edges });
  }
  return out;
}

function edgeLinks(edges: readonly Edge[], d: Digit): ChainLink[] {
  return edges.map((e) => ({ from: { cell: e.a, digit: d }, to: { cell: e.b, digit: d }, strong: true }));
}

const edgeData = (edges: readonly Edge[]) => edges.map((e) => ({ a: e.a, b: e.b, house: house(e.house) }));

export const simpleColoring: Technique = {
  id: "simple-coloring",
  tier: 4,
  rating: 4.5,
  find(s) {
    const pos = housePositions(s);
    for (const d of openDigits(s)) {
      for (const cl of clusters(s, d, pos)) {
        const wrap = findWrap(s, cl, d);
        if (wrap) return wrap;
        const trap = findTrap(s, cl, d);
        if (trap) return trap;
      }
    }
    return null;
  },
};

function findWrap(s: SolverState, cl: Cluster, d: Digit): Step | null {
  for (const k of [0, 1] as const) {
    const group = cl.colors[k];
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        if (!sees(s, a, b)) continue;
        const truth = cl.colors[1 - k]!;
        const elims: Elimination[] = group.map((cell) => ({ cell, digit: d }));
        const h = sharedHouse(a, b);
        const clashHouse: House | null = h >= 0 ? house(h) : null;
        return makeStep({
          technique: "simple-coloring",
          tier: 4,
          rating: 4.5,
          eliminations: elims,
          focus: { cells: [...truth, ...group].sort((x, y) => x - y), cages: [], houses: clashHouse ? [clashHouse] : [] },
          explain: {
            kind: "simple-coloring",
            rule: "wrap",
            digit: d,
            on: truth,
            off: group,
            links: edgeData(cl.edges),
            clash: { cells: [a, b], house: clashHouse },
          },
          marks: withContext(s, d, [...marksFor(s, truth, bit(d), "on"), ...elimMarks(elims)]),
          links: [...edgeLinks(cl.edges, d), { from: { cell: a, digit: d }, to: { cell: b, digit: d }, strong: false }],
        });
      }
    }
  }
  return null;
}

function findTrap(s: SolverState, cl: Cluster, d: Digit): Step | null {
  const [on, off] = cl.colors;
  const members = new Set([...on, ...off]);
  const elims: Elimination[] = [];
  const traps: { cell: CellId; on: CellId; off: CellId }[] = [];
  for (let c = 0; c < 81; c++) {
    if (s.grid[c] || !(s.cand[c]! & bit(d)) || members.has(c)) continue;
    const seenOn = on.find((x) => sees(s, c, x));
    if (seenOn === undefined) continue;
    const seenOff = off.find((x) => sees(s, c, x));
    if (seenOff === undefined) continue;
    elims.push({ cell: c, digit: d });
    traps.push({ cell: c, on: seenOn, off: seenOff });
  }
  if (!elims.length) return null;
  return makeStep({
    technique: "simple-coloring",
    tier: 4,
    rating: 4.5,
    eliminations: elims,
    focus: { cells: [...members].sort((x, y) => x - y), cages: [], houses: [] },
    explain: { kind: "simple-coloring", rule: "trap", digit: d, on, off, links: edgeData(cl.edges), traps },
    marks: withContext(s, d, [...marksFor(s, on, bit(d), "on"), ...marksFor(s, off, bit(d), "off"), ...elimMarks(elims)]),
    links: edgeLinks(cl.edges, d),
  });
}
