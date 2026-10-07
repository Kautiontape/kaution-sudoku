/**
 * Teaching content for the Queens Learn screen and the hint "what" rung. Tiers and ratings come
 * from the solver registry so the catalog can't drift from what the solver does.
 */
import type { TechniqueInfo } from "../hint-types";
import { QUEENS_REGISTRY } from "./techniques";

/** Short rule sentences for a "How to play" panel. */
export const QUEENS_RULES: string[] = [
  "Place one queen in every row.",
  "Place one queen in every column.",
  "Place one queen in every coloured region.",
  "Queens can't touch each other, not even diagonally.",
  "Queens may share a long diagonal, as long as they don't touch.",
];

type Content = Omit<TechniqueInfo, "id" | "family" | "tier" | "rating">;

const CONTENT: Record<string, Content> = {
  "last-cell": {
    name: "Last Cell",
    summary: "When a row, column or region has only one cell left that could hold a queen, the queen goes there.",
    spot:
      "Start with the smallest regions: a one-cell region is a free queen. Then look for rows, columns and regions where every other cell is crossed out, touches a queen, or shares a line or region with one.",
    why: "Every row, column and region needs exactly one queen. If only one of its cells is still possible, that cell must hold it.",
    tip: "After placing a queen, cross out its whole row, column and region plus the 8 cells around it. New last cells often appear straight away.",
    aka: ["Only spot", "Single"],
  },
  "region-in-line": {
    name: "Region in a Line",
    summary: "If all of a region's open cells sit in one row (or column), that row's queen belongs to the region.",
    spot: "Look for regions shaped like a straight bar, or regions whose open cells have been trimmed down to a single row or column.",
    why:
      "The region's queen has to be on one of those cells, so it will also be the queen of that row. A row only gets one queen, so every other cell of the row is out.",
    tip: "Thin regions are the classic case: a 1×3 bar clears the rest of its row at once.",
    aka: ["Pointing", "Region locked to a line"],
  },
  "line-in-region": {
    name: "Line in a Region",
    summary: "If all of a row's (or column's) open cells are in one region, that region's queen is in that row.",
    spot: "Scan rows and columns with only a few open cells left and check whether those cells share a colour.",
    why: "The row needs a queen and can only get it from that region. A region has only one queen, so it can't have another one outside the row.",
    tip: "This is Region in a Line turned around: check rows and columns against regions, not just regions against rows.",
    aka: ["Claiming", "Line locked to a region"],
  },
  touch: {
    name: "Touch",
    summary:
      "A cell is out if a queen there would rule out every remaining cell of some row, column or region.",
    spot:
      "Look at small regions and nearly finished rows or columns. Any cell that touches all of their open cells, or touches some and shares a row, column or region with the rest, can't hold a queen.",
    why:
      "A queen rules out its whole row, column and region and the 8 cells around it. If that would wipe out every option of another row, column or region, that unit would be left with no queen, which breaks the rules.",
    tip:
      "Learn the shapes. For two side-by-side cells, the two cells above and the two below touch both. For a 1×3 bar, the middle cells above and below touch all three. For an L of three cells, the cell that would complete the 2×2 square touches all of them.",
    aka: ["Neighbour elimination", "Wipeout"],
  },
  confinement: {
    name: "Confinement",
    summary:
      "When some regions fit entirely inside the same number of rows (or columns), those rows are reserved for them.",
    spot:
      "Look for two regions packed into the same two rows or columns, then three into three. It works the other way round too: rows (or columns) whose open cells all belong to the same number of regions.",
    why:
      "Two regions need two queens, and if both must land in the same two rows, those rows' two queens are taken. No other region can use them. The other way round: if two rows can only get queens from two regions, those regions' queens are used up in those rows and can't appear anywhere else.",
    tip: "Region in a Line is the one-region case. Start by looking for pairs before trying three or more.",
    aka: ["Squeeze", "Pigeonhole", "N regions in N rows"],
  },
  contradiction: {
    name: "Contradiction",
    summary:
      "Imagine a queen on a cell and follow only the moves it forces. If some row, column or region ends up with no room, that cell can't hold a queen.",
    spot:
      "Use it when nothing simpler works. Good cells to test sit next to small regions or in crowded rows and columns, where a queen would do the most damage.",
    why:
      "Every forced move in the chain must follow if the queen were there. If the chain leaves a unit with nowhere for its queen, the starting queen was impossible: the puzzle has a solution, so the assumption must be false.",
    tip: "Only follow forced moves: a row, column or region with one cell left. If nothing is forced, the test tells you nothing, so try another cell.",
    aka: ["What if", "Forcing chain", "Trial"],
  },
};

export const QUEENS_TECHNIQUES: TechniqueInfo[] = QUEENS_REGISTRY.map((t) => {
  const content = CONTENT[t.id];
  if (!content) throw new Error(`No catalog entry for queens technique ${t.id}`);
  return { id: t.id, family: "queens", tier: t.tier, rating: t.rating, ...content };
});

export function queensTechniqueInfo(id: string): TechniqueInfo | undefined {
  return QUEENS_TECHNIQUES.find((t) => t.id === id);
}
