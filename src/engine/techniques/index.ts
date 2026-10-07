/**
 * Technique registry, easiest first. The logical solver asks each in order and applies the first
 * step found, so hints always show the easiest available deduction.
 */
import { ADVANCED_TECHNIQUES } from "./advanced";
import { claiming, pointing } from "./intersections";
import { inniesMulti, inniesSingle } from "./innies";
import { cageCandidateCombos, cageClaim, cageLastCell, cageLocked, cageSumCombos } from "./killer";
import { fullHouse, hiddenSingle, nakedSingle } from "./singles";
import { hiddenPair, hiddenQuad, hiddenTriple, nakedPair, nakedQuad, nakedTriple } from "./subsets";
import type { Technique } from "./types";

export type { Technique } from "./types";

/** Every technique, sorted by base rating (stable for equal ratings). */
export const TECHNIQUES: readonly Technique[] = [
  fullHouse,
  cageLastCell,
  hiddenSingle,
  cageSumCombos,
  nakedSingle,
  cageCandidateCombos,
  pointing,
  cageLocked,
  claiming,
  cageClaim,
  nakedPair,
  inniesSingle,
  hiddenPair,
  inniesMulti,
  nakedTriple,
  hiddenTriple,
  nakedQuad,
  hiddenQuad,
  ...ADVANCED_TECHNIQUES,
].sort((a, b) => a.rating - b.rating);
