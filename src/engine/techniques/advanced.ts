/**
 * Advanced sudoku techniques (fish, wings, single-digit patterns, colouring, uniqueness, chains).
 * Registered alongside the basic ones in techniques/index.ts and sorted by rating there; within
 * equal ratings this order is kept.
 */
import { aic, xChain, xyChain } from "./chains";
import { simpleColoring } from "./coloring";
import { finnedSwordfish, finnedXWing, jellyfish, swordfish, xWing } from "./fish";
import { emptyRectangle, skyscraper, twoStringKite } from "./single-digit";
import type { Technique } from "./types";
import { bugPlusOne, uniqueRectangle } from "./uniqueness";
import { wWing, xyWing, xyzWing } from "./wings";

export { aic, xChain, xyChain } from "./chains";
export { simpleColoring } from "./coloring";
export { finnedSwordfish, finnedXWing, jellyfish, swordfish, xWing } from "./fish";
export { emptyRectangle, skyscraper, twoStringKite } from "./single-digit";
export { bugPlusOne, uniqueRectangle } from "./uniqueness";
export { wWing, xyWing, xyzWing } from "./wings";

export const ADVANCED_TECHNIQUES: readonly Technique[] = [
  xWing, // 3.2
  finnedXWing, // 3.4
  swordfish, // 3.8
  finnedSwordfish, // 4.0
  skyscraper, // 4.0
  twoStringKite, // 4.1
  xyWing, // 4.2
  xyzWing, // 4.4
  wWing, // 4.4
  emptyRectangle, // 4.5
  simpleColoring, // 4.5
  uniqueRectangle, // 4.5
  jellyfish, // 5.2
  bugPlusOne, // 5.6
  xChain, // 6.0
  xyChain, // 6.2
  aic, // 6.6
];
