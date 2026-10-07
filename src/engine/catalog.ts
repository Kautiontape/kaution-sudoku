/**
 * Technique catalog for the Learn screen and the hint ladder's "what" rung.
 * Static teaching content — hint text for a specific step comes from hints/templates.
 */
import { ADVANCED_CATALOG } from "./catalog-advanced";
import type { TechniqueInfo } from "./hint-types";

const BASIC: TechniqueInfo[] = [
  {
    id: "full-house",
    name: "Full House",
    family: "sudoku",
    tier: 1,
    rating: 1.0,
    summary: "A row, column or box with one empty cell takes the one digit it's missing.",
    spot: "Look for houses with eight digits filled in. The empty cell gets whichever digit from 1 to 9 is absent.",
    why: "Every house holds each digit exactly once, so the missing digit has nowhere else to go.",
    tip: "After each placement, glance along its row, column and box — one of them may have just become nearly full.",
    aka: ["Last Digit"],
  },
  {
    id: "hidden-single",
    name: "Hidden Single",
    family: "sudoku",
    tier: 1,
    rating: 1.2,
    summary: "A digit that has only one possible cell left in a row, column or box.",
    spot: "Pick a digit and a box. Follow each copy of that digit already on the board along its row and column: every cell those lines cross is blocked. If only one cell in the box survives, the digit goes there. This is called cross-hatching, and it works the same way for rows and columns.",
    why: "Every house must contain each digit once. If every other cell is blocked, the last one has to hold it — even if that cell could also take other digits.",
    tip: "Start with digits that already appear many times; they block the most cells.",
    aka: ["Cross-hatching", "Pinned Digit"],
  },
  {
    id: "naked-single",
    name: "Naked Single",
    family: "sudoku",
    tier: 1,
    rating: 2.3,
    summary: "A cell where every digit but one is already used in its row, column or box.",
    spot: "Pick a crowded cell and collect the digits its row, column and box already contain. If eight different digits are taken, the ninth is the answer. With notes, it's any cell left with a single candidate.",
    why: "A cell must hold one of 1–9. If eight of them already appear around it, only one remains.",
    tip: "Cells at the crossing of a busy row and a busy column are the best places to look.",
    aka: ["Sole Candidate", "Singleton"],
  },
  {
    id: "pointing",
    name: "Pointing",
    family: "sudoku",
    tier: 2,
    rating: 2.6,
    summary: "When a digit's spots in a box all lie on one row or column, that line can't use the digit outside the box.",
    spot: "In a box, look at where one digit can go. If those cells line up in a single row or column, follow that line out of the box and cross the digit off along it.",
    why: "The box must put the digit in one of those aligned cells. Either way, that row or column gets its copy inside the box — so it can't have another one elsewhere.",
    aka: ["Pointing Pair", "Pointing Triple", "Locked Candidates (Type 1)"],
  },
  {
    id: "claiming",
    name: "Box/Line Reduction",
    family: "sudoku",
    tier: 2,
    rating: 2.8,
    summary: "When a digit's spots in a row or column all fall inside one box, the rest of that box can't use the digit.",
    spot: "In a row or column, check where a digit can go. If all of those cells sit in the same box, remove the digit from that box's other cells.",
    why: "The line must place the digit somewhere in that box, so the box's one copy of the digit is spoken for by the line.",
    aka: ["Claiming", "Locked Candidates (Type 2)"],
  },
  {
    id: "naked-pair",
    name: "Naked Pair",
    family: "sudoku",
    tier: 2,
    rating: 3.0,
    summary: "Two cells in a house with the same two candidates use up those digits for the whole house.",
    spot: "Look for two cells whose notes are exactly the same pair — say {3,7} — in one row, column or box.",
    why: "One of the cells will be 3 and the other 7. We don't know which, but between them they take both digits, so no other cell in that house can be 3 or 7.",
    tip: "If the two cells also share a box, the pair clears that box too.",
  },
  {
    id: "hidden-pair",
    name: "Hidden Pair",
    family: "sudoku",
    tier: 2,
    rating: 3.4,
    summary: "Two digits that can only go in the same two cells of a house — so those cells can't hold anything else.",
    spot: "For each digit in a house, count its possible cells. When two digits are both limited to the same two cells, those cells belong to that pair.",
    why: "Both digits must appear in the house, and there are only two cells for them, so they fill those cells. Any other candidates there are impossible.",
    tip: "Clear the extra candidates and a hidden pair turns into a naked pair.",
  },
  {
    id: "naked-triple",
    name: "Naked Triple",
    family: "sudoku",
    tier: 3,
    rating: 3.6,
    summary: "Three cells in a house whose candidates, put together, are only three digits.",
    spot: "The cells don't each need all three digits — {1,2}, {2,3} and {1,3} counts. What matters is three cells and three digits in total.",
    why: "Three cells need three different digits, and only those three are available to them, so those digits are used up in that house.",
  },
  {
    id: "hidden-triple",
    name: "Hidden Triple",
    family: "sudoku",
    tier: 3,
    rating: 4.0,
    summary: "Three digits confined to the same three cells of a house.",
    spot: "Find three digits whose possible cells in a house, combined, are just three cells. Each digit needn't be in every one of them.",
    why: "Three digits need three homes and these are the only ones, so the cells belong to those digits — every other candidate in them can go.",
  },
  {
    id: "naked-quad",
    name: "Naked Quad",
    family: "sudoku",
    tier: 4,
    rating: 5.0,
    summary: "Four cells in a house whose candidates together are only four digits.",
    spot: "Same idea as a naked triple with one more cell: four cells, four digits in total between them.",
    why: "Four cells, four available digits — those digits are used up in that house.",
    tip: "If a house has eight empty cells, a naked quad means the other four cells form a hidden quad.",
  },
  {
    id: "hidden-quad",
    name: "Hidden Quad",
    family: "sudoku",
    tier: 4,
    rating: 5.4,
    summary: "Four digits confined to the same four cells of a house.",
    spot: "Four digits whose possible cells in a house combine to just four cells.",
    why: "Those cells must hold those four digits, so their other candidates can go.",
  },
];

const KILLER: TechniqueInfo[] = [
  {
    id: "cage-last-cell",
    name: "Cage Remainder",
    family: "killer",
    tier: 1,
    rating: 1.0,
    summary: "When all but one cell of a cage is filled, the last cell is whatever's left of the sum.",
    spot: "Look for cages with a single empty cell and subtract the placed digits from the cage's total. A one-cell cage is simply a given.",
    why: "A cage's cells add up exactly to its clue, so the remainder is forced.",
  },
  {
    id: "cage-combos",
    name: "Cage Combinations",
    family: "killer",
    tier: 1,
    rating: 1.7,
    summary: "A cage's sum and size limit which digits it can contain.",
    spot: "List the ways to make the sum from that many different digits. Some cages can only be made one way: in two cells 3 = 1+2, 4 = 1+3, 16 = 7+9, 17 = 8+9; in three cells 6 = 1+2+3, 7 = 1+2+4, 23 = 6+8+9, 24 = 7+8+9; in four cells 10 = 1+2+3+4, 11 = 1+2+3+5, 29 = 5+7+8+9, 30 = 6+7+8+9. Then check which combinations still fit what's on the board.",
    why: "A cage never repeats a digit and its digits must add up to the clue. A digit that appears in no workable combination can't be in the cage at all.",
    tip: "Small sums need small digits and big sums need big ones. Two-cell cages near 10 tell you the least.",
    aka: ["Combinations", "Magic cages"],
  },
  {
    id: "cage-locked",
    name: "Cage Pointing",
    family: "killer",
    tier: 2,
    rating: 2.6,
    summary: "If a cage must contain a digit, and its cells that can take it lie in one row, column or box, that house can't use the digit anywhere else.",
    spot: "Find digits a cage is forced to contain (they appear in every remaining combination), then see which of its cells can hold them.",
    why: "The cage will definitely hold that digit in one of those aligned cells, so the house's copy is inside the cage.",
    tip: "A cage that sits entirely inside one row, column or box removes all of its required digits from the rest of that house.",
    aka: ["Required digits"],
  },
  {
    id: "cage-claim",
    name: "Cage Claim",
    family: "killer",
    tier: 2,
    rating: 2.8,
    summary: "If a house can only place a digit inside one cage, that cage must contain it — which trims the cage's combinations.",
    spot: "When a digit's remaining spots in a row, column or box all fall inside one cage, cross off that cage's combinations that don't use the digit.",
    why: "The house needs the digit and the only places for it are in that cage, so the cage includes it. Cages never repeat digits, so it can't appear elsewhere in the cage either.",
  },
  {
    id: "innies-outies",
    name: "45 Rule (Innies & Outies)",
    family: "killer",
    tier: 3,
    rating: 3.0,
    summary: "Every row, column and box adds up to 45. Subtract the cages that fit inside a region to find the total of the cells left over.",
    spot: "Pick a row, column or box — or a few side by side. Add up the cages that sit entirely inside it. The region's cells that belong to cages sticking out (the innies) make up the difference: 45 per house minus the inside cages. The parts of those cages that stick out of the region (the outies) can be worked out the same way from the other side.",
    why: "A region's digits always total 45 per house, and every cage sum is fixed, so whatever the inside cages don't account for has to come from the leftover cells. One leftover cell is solved outright; two or three act like a new, hidden cage.",
    tip: "Look for regions where nearly every cage fits inside — often just one cell pokes out.",
    aka: ["Law of 45", "Innies and Outies"],
  },
];

export const SUDOKU_CATALOG: readonly TechniqueInfo[] = [...BASIC, ...KILLER, ...ADVANCED_CATALOG];

const byId = new Map<string, TechniqueInfo>();
export function registerCatalog(entries: readonly TechniqueInfo[]): void {
  for (const e of entries) byId.set(e.id, e);
}
registerCatalog(SUDOKU_CATALOG);

export function techniqueInfo(id: string): TechniqueInfo | undefined {
  return byId.get(id);
}

/** Display name for a technique id, falling back to a readable version of the id. */
export function techniqueName(id: string): string {
  return byId.get(id)?.name ?? id.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
