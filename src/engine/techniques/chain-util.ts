/**
 * Alternating inference chains over candidates ("nodes": a digit in a cell).
 *
 * - Strong link (A = B): A and B can't both be false. From a house where a digit has exactly two
 *   places (bi-location), or a cell with exactly two candidates (bi-value). Never from killer cages.
 * - Weak link (A - B): A and B can't both be true. Same digit in cells that see each other (row,
 *   column, box, or killer cage), or two digits in the same cell.
 *
 * A chain starts and ends with a strong link: N1 = N2 - N3 = N4 … = Nk. If N1 is false, N2 is true,
 * so N3 is false, … so Nk is true. Hence N1 or Nk is true, and any candidate weakly linked to both
 * ends can go.
 *
 * Search: breadth-first from every start node, so the first productive end found from a start is a
 * shortest chain from it; across starts the shortest chain wins (ties: lowest start node), and once
 * a chain is known only strictly shorter ones are searched for. Chains are capped in length.
 */
import { digitsOf } from "../combos";
import type { SolverState } from "../state";
import type { CellId, Digit, Elimination } from "../types";
import { cellsAt, housePositions, peersOf } from "./links";
import { bit, popcount, sees } from "./util";

export type ChainVariant = "x-chain" | "xy-chain" | "aic";

/** Node id for candidate d in cell c. */
export const nodeOf = (c: CellId, d: Digit): number => c * 9 + d - 1;
export const nodeCell = (n: number): CellId => Math.floor(n / 9);
export const nodeDigit = (n: number): Digit => (n % 9) + 1;

const NODES = 729;

export interface ChainGraph {
  present: Uint8Array;
  strong: number[][];
  /** Weak neighbours that can continue the chain (they have a strong link of their own). */
  weak: number[][];
}

/**
 * - x-chain: one digit at a time — bi-location strong links, same-digit weak links.
 * - xy-chain: bi-value cells only — bi-value strong links, same-digit weak links between them.
 * - aic: everything.
 */
export function buildGraph(s: SolverState, variant: ChainVariant): ChainGraph {
  const present = new Uint8Array(NODES);
  const strong: number[][] = Array.from({ length: NODES }, () => []);
  const weak: number[][] = Array.from({ length: NODES }, () => []);
  for (let c = 0; c < 81; c++) {
    if (s.grid[c]) continue;
    if (variant === "xy-chain" && popcount(s.cand[c]!) !== 2) continue;
    for (const d of digitsOf(s.cand[c]!)) present[nodeOf(c, d)] = 1;
  }
  const link = (a: number, b: number): void => {
    if (strong[a]!.includes(b)) return;
    strong[a]!.push(b);
    strong[b]!.push(a);
  };
  if (variant !== "xy-chain") {
    const pos = housePositions(s);
    for (let h = 0; h < 27; h++)
      for (let d = 1; d <= 9; d++) {
        const m = pos[h * 10 + d]!;
        if (popcount(m) !== 2) continue;
        const [a, b] = cellsAt(h, m) as [CellId, CellId];
        link(nodeOf(a, d), nodeOf(b, d));
      }
  }
  if (variant !== "x-chain") {
    for (let c = 0; c < 81; c++) {
      if (s.grid[c] || popcount(s.cand[c]!) !== 2) continue;
      const [x, y] = digitsOf(s.cand[c]!) as [Digit, Digit];
      link(nodeOf(c, x), nodeOf(c, y));
    }
  }
  for (let n = 0; n < NODES; n++) {
    if (!present[n]) continue;
    const c = nodeCell(n);
    const d = nodeDigit(n);
    for (const p of peersOf(s, c)) {
      const m = nodeOf(p, d);
      if (present[m] && strong[m]!.length) weak[n]!.push(m);
    }
    if (variant === "aic")
      for (const e of digitsOf(s.cand[c]! & ~bit(d))) {
        const m = nodeOf(c, e);
        if (strong[m]!.length) weak[n]!.push(m);
      }
    weak[n]!.sort((a, b) => a - b);
    strong[n]!.sort((a, b) => a - b);
  }
  return { present, strong, weak };
}

/**
 * Candidates (outside the chain) weakly linked to both ends: the same digit in cells seeing both
 * end cells; the other digits of the cell when both ends share a cell; and when the ends are
 * different digits in cells that see each other, each end's digit in the other end's cell.
 */
export function endEliminations(s: SolverState, a: number, b: number, chain: ReadonlySet<number>): Elimination[] {
  const ca = nodeCell(a);
  const cb = nodeCell(b);
  const da = nodeDigit(a);
  const db = nodeDigit(b);
  const out: Elimination[] = [];
  const add = (cell: CellId, digit: Digit): void => {
    if (!s.grid[cell] && s.cand[cell]! & bit(digit) && !chain.has(nodeOf(cell, digit))) out.push({ cell, digit });
  };
  if (da === db) {
    if (ca === cb) return out;
    for (const p of peersOf(s, ca)) if (p !== cb && sees(s, p, cb)) add(p, da);
  } else if (ca === cb) {
    for (const e of digitsOf(s.cand[ca]! & ~bit(da) & ~bit(db))) add(ca, e);
  } else if (sees(s, ca, cb)) {
    add(cb, da);
    add(ca, db);
  }
  return out.sort((x, y) => x.cell - y.cell || x.digit - y.digit);
}

export interface ChainHit {
  /** Node ids, start (assumed false) to end (then true). */
  nodes: number[];
  elims: Elimination[];
}

export interface ChainSearch {
  /** Longest chain to consider, in nodes. */
  maxNodes: number;
  /** Shortest chain to report, in nodes (≥ 4: two strong links and a weak one). */
  minNodes: number;
  /** Require both ends to be the same digit. */
  sameDigitEnds?: boolean;
}

// BFS scratch space, reused between searches. State = node * 2 + (1 if reached by a strong link).
const MARK = new Int32Array(NODES * 2);
const PARENT = new Int32Array(NODES * 2);
const LEN = new Uint8Array(NODES * 2);
const QUEUE = new Int32Array(NODES * 2);
let generation = 0;

function onPath(state: number, n: number): boolean {
  for (let st = state; st >= 0; st = PARENT[st]!) if (st >> 1 === n) return true;
  return false;
}

function pathTo(state: number): number[] {
  const out: number[] = [];
  for (let st = state; st >= 0; st = PARENT[st]!) out.push(st >> 1);
  return out.reverse();
}

function bfs(s: SolverState, g: ChainGraph, start: number, maxNodes: number, opts: ChainSearch): ChainHit | null {
  generation++;
  let head = 0;
  let tail = 0;
  const first = start * 2;
  MARK[first] = generation;
  PARENT[first] = -1;
  LEN[first] = 1;
  QUEUE[tail++] = first;
  while (head < tail) {
    const st = QUEUE[head++]!;
    const n = st >> 1;
    const on = st & 1;
    const len = LEN[st]!;
    if (len >= maxNodes) continue;
    for (const m of on ? g.weak[n]! : g.strong[n]!) {
      const next = m * 2 + (on ? 0 : 1);
      if (MARK[next] === generation || onPath(st, m)) continue;
      MARK[next] = generation;
      PARENT[next] = st;
      LEN[next] = len + 1;
      if (!on && len + 1 >= opts.minNodes && (!opts.sameDigitEnds || nodeDigit(m) === nodeDigit(start))) {
        const nodes = pathTo(next);
        const elims = endEliminations(s, start, m, new Set(nodes));
        if (elims.length) return { nodes, elims };
      }
      QUEUE[tail++] = next;
    }
  }
  return null;
}

/** The shortest productive chain (ties: lowest start node), or null. */
export function findChain(s: SolverState, g: ChainGraph, opts: ChainSearch): ChainHit | null {
  let best: ChainHit | null = null;
  for (let n = 0; n < NODES; n++) {
    if (!g.present[n] || !g.strong[n]!.length) continue;
    const limit = best ? best.nodes.length - 1 : opts.maxNodes;
    if (limit < opts.minNodes) break;
    const hit = bfs(s, g, n, limit, opts);
    if (hit) best = hit;
  }
  return best;
}
