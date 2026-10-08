/**
 * Chains (see chain-util.ts for the search):
 * - X-chain: one digit; strong links are houses with two places for it.
 * - XY-chain: cells with two candidates; ends on the same digit.
 * - AIC: alternating inference chain mixing both kinds of strong link.
 *
 * Longer chains rate slightly higher.
 */
import type { SolverState } from "../state";
import type { CandidateMark, ChainLink, Step } from "../types";
import { buildGraph, findChain, nodeCell, nodeDigit, type ChainHit, type ChainVariant } from "./chain-util";
import { conjugateHouse, sharedHouse, withContext } from "./links";
import type { Technique } from "./types";
import { elimMarks, house, makeStep } from "./util";

interface Spec {
  id: ChainVariant;
  tier: number;
  rating: number;
  /** Chains up to this many nodes rate at the base rating; each two nodes more add 0.1 (max +0.4). */
  plain: number;
  maxNodes: number;
}

export const CHAIN_LIMITS = { "x-chain": 12, "xy-chain": 16, aic: 12 } as const;

function linkData(s: SolverState, a: number, b: number, strong: boolean): Record<string, unknown> {
  const ca = nodeCell(a);
  const cb = nodeCell(b);
  if (ca === cb) return { strong, via: "cell" };
  if (strong) return { strong, via: "house", house: house(conjugateHouse(s, ca, cb, nodeDigit(a))) };
  const h = sharedHouse(ca, cb);
  return h >= 0 ? { strong, via: "peer", house: house(h) } : { strong, via: "cage" };
}

function chainStep(s: SolverState, spec: Spec, hit: ChainHit): Step {
  const nodes = hit.nodes.map((n) => ({ cell: nodeCell(n), digit: nodeDigit(n) }));
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  const ends = first.digit === last.digit ? "digit" : first.cell === last.cell ? "cell" : "cross";
  const links: ChainLink[] = [];
  const linkInfo: Record<string, unknown>[] = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    links.push({ from: nodes[i]!, to: nodes[i + 1]!, strong: i % 2 === 0 });
    linkInfo.push(linkData(s, hit.nodes[i]!, hit.nodes[i + 1]!, i % 2 === 0));
  }
  const chainMarks: CandidateMark[] = nodes.map((n, i) => ({ ...n, role: i % 2 === 0 ? "off" : "on" }));
  const marks = [...chainMarks, ...elimMarks(hit.elims)];
  const extra = Math.min(4, Math.max(0, Math.floor((nodes.length - spec.plain) / 2)));
  return makeStep({
    technique: spec.id,
    tier: spec.tier,
    rating: Math.round((spec.rating + extra * 0.1) * 10) / 10,
    eliminations: hit.elims,
    focus: { cells: [...new Set(nodes.map((n) => n.cell))].sort((a, b) => a - b), cages: [], houses: [] },
    explain: { kind: "chain", variant: spec.id, nodes, links: linkInfo, ends },
    marks: spec.id === "x-chain" ? withContext(s, first.digit, marks) : marks,
    links,
  });
}

function chainTechnique(spec: Spec): Technique {
  return {
    id: spec.id,
    tier: spec.tier,
    rating: spec.rating,
    find(s) {
      const hit = findChain(s, buildGraph(s, spec.id), {
        maxNodes: spec.maxNodes,
        minNodes: 4,
        sameDigitEnds: spec.id !== "aic",
      });
      return hit ? chainStep(s, spec, hit) : null;
    },
  };
}

export const xChain = chainTechnique({ id: "x-chain", tier: 5, rating: 6.0, plain: 6, maxNodes: CHAIN_LIMITS["x-chain"] });
export const xyChain = chainTechnique({ id: "xy-chain", tier: 5, rating: 6.2, plain: 8, maxNodes: CHAIN_LIMITS["xy-chain"] });
export const aic = chainTechnique({ id: "aic", tier: 5, rating: 6.6, plain: 6, maxNodes: CHAIN_LIMITS.aic });
