/** Narration for alternating chains: "If r1c1 isn't 4, then r1c5 is 4 (…), so r3c5 isn't 4 (…), …". */
import { cellName, houseName } from "../geometry";
import type { CellId, Digit, House, Puzzle } from "../types";
import { relation } from "./format";

export interface ChainNode {
  cell: CellId;
  digit: Digit;
}

export interface ChainLinkX {
  strong: boolean;
  /** cell: two digits of one cell; house: the only two places in a house; peer: cells that see each other; cage: killer cage-mates. */
  via: "cell" | "house" | "peer" | "cage";
  house?: House;
}

/** "r3c5 isn't 4 (same column as r1c5)" / "r1c5 is 4 (the only other 4 in row 1)" for the node a link leads to. */
export function linkClause(from: ChainNode, to: ChainNode, link: ChainLinkX, p: Puzzle): string {
  const name = cellName(to.cell);
  if (link.strong) {
    // A two-candidate cell flips within itself: the previous clause already named the cell.
    if (link.via === "cell") return `it's ${to.digit} (its only other candidate)`;
    return `${name} is ${to.digit} (the only other ${to.digit} in ${houseName(link.house!)})`;
  }
  if (link.via === "cell") return `${name} isn't ${to.digit} (it's ${from.digit})`;
  return `${name} isn't ${to.digit} (${relation(from.cell, to.cell, p)} as ${cellName(from.cell)})`;
}

/**
 * One sentence per strong link: the first opens with the assumption, the rest follow on.
 *   If r1c1 isn't 4, then r1c5 is 4 (the only other 4 in row 1).
 *   That means r3c5 isn't 4 (same column as r1c5), so r3c2 is 4 (the only other 4 in row 3).
 */
export function chainSentences(nodes: readonly ChainNode[], links: readonly ChainLinkX[], p: Puzzle): string[] {
  const out: string[] = [];
  const first = nodes[0]!;
  out.push(`If ${cellName(first.cell)} isn't ${first.digit}, then ${linkClause(first, nodes[1]!, links[0]!, p)}.`);
  for (let i = 2; i + 1 < nodes.length; i += 2) {
    const weak = linkClause(nodes[i - 1]!, nodes[i]!, links[i - 1]!, p);
    const strong = linkClause(nodes[i]!, nodes[i + 1]!, links[i]!, p);
    out.push(`That means ${weak}, so ${strong}.`);
  }
  return out;
}

/** "r1c1 is 4" */
export const isText = (n: ChainNode): string => `${cellName(n.cell)} is ${n.digit}`;
