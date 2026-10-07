import { difficultyFor, gradeSteps, SIZE_FOR_DIFFICULTY } from "../../../src/engine/queens/grade";
import { solveLogically } from "../../../src/engine/queens/logical";
import type { QStep } from "../../../src/engine/queens/types";
import { DIFFICULTIES } from "../../../src/engine/types";
import { UNIQUE5 } from "./fixtures";

const step = (technique: string, tier: number, rating: number): QStep => ({
  technique,
  tier,
  rating,
  placements: [],
  eliminations: [],
  focus: { cells: [], rows: [], cols: [], regions: [] },
  explain: { kind: technique },
});

describe("queens grading", () => {
  it("records the hardest step, techniques in order of first use, and counts", () => {
    const g = gradeSteps([
      step("last-cell", 1, 1),
      step("touch", 2, 2.5),
      step("last-cell", 1, 1),
      step("confinement", 3, 3.5),
      step("touch", 3, 3),
    ]);
    expect(g).toEqual({
      tier: 3,
      rating: 3.5,
      difficulty: "medium",
      techniques: ["last-cell", "touch", "confinement"],
      counts: { "last-cell": 2, touch: 2, confinement: 1 },
      steps: 5,
    });
  });

  it("maps the hardest tier to a difficulty", () => {
    expect([1, 2, 3, 4, 5].map(difficultyFor)).toEqual(["easy", "easy", "medium", "hard", "expert"]);
    expect(gradeSteps([]).difficulty).toBe("easy");
  });

  it("grades a real solve", () => {
    const g = gradeSteps(solveLogically(UNIQUE5).steps);
    expect(g.tier).toBe(2);
    expect(g.difficulty).toBe("easy");
    expect(g.techniques[0]).toBe("last-cell");
  });

  it("has board sizes for every difficulty, growing with difficulty", () => {
    for (const d of DIFFICULTIES) expect(SIZE_FOR_DIFFICULTY[d].length).toBeGreaterThan(0);
    const smallest = DIFFICULTIES.map((d) => Math.min(...SIZE_FOR_DIFFICULTY[d]));
    expect([...smallest].sort((a, b) => a - b)).toEqual(smallest);
  });
});
