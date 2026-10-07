import { TIER_NAMES } from "../../../src/engine/hint-types";
import { QUEENS_RULES, QUEENS_TECHNIQUES, queensTechniqueInfo } from "../../../src/engine/queens/catalog";
import { QUEENS_REGISTRY } from "../../../src/engine/queens/techniques";

describe("queens catalog", () => {
  it("has teaching content for every solver technique, in solver order", () => {
    expect(QUEENS_TECHNIQUES.map((t) => t.id)).toEqual(QUEENS_REGISTRY.map((t) => t.id));
    for (const info of QUEENS_TECHNIQUES) {
      const solver = QUEENS_REGISTRY.find((t) => t.id === info.id)!;
      expect(info.family).toBe("queens");
      expect(info.tier).toBe(solver.tier);
      expect(info.rating).toBe(solver.rating);
      expect(TIER_NAMES[info.tier]).toBeDefined();
      for (const text of [info.name, info.summary, info.spot, info.why, info.tip ?? ""]) {
        expect(text.trim().length).toBeGreaterThan(3);
        expect(text).not.toMatch(/undefined|TODO/);
      }
    }
    expect(new Set(QUEENS_TECHNIQUES.map((t) => t.name)).size).toBe(QUEENS_TECHNIQUES.length);
    expect(queensTechniqueInfo("touch")!.name).toBe("Touch");
    expect(queensTechniqueInfo("nope")).toBeUndefined();
  });

  it("states the rules, including the no-touch rule", () => {
    expect(QUEENS_RULES.length).toBeGreaterThanOrEqual(4);
    expect(QUEENS_RULES.join(" ")).toMatch(/touch/);
    expect(QUEENS_RULES.join(" ")).toMatch(/region/);
  });
});
