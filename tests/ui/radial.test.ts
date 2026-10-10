import { describe, expect, it } from "vitest";
import { radialDot, radialPick } from "../../src/ui/components/radial";

describe("radial number wheel", () => {
  it("lays nine dots evenly, with 1 at the top", () => {
    const one = radialDot(1);
    expect(one.x).toBeCloseTo(0, 6);
    expect(one.y).toBeCloseTo(-1, 6); // y grows downward, so straight up is −1
    // Every dot is a unit vector, and no two coincide.
    const seen = new Set<string>();
    for (let d = 1; d <= 9; d++) {
      const { x, y } = radialDot(d);
      expect(Math.hypot(x, y)).toBeCloseTo(1, 6);
      seen.add(`${x.toFixed(3)},${y.toFixed(3)}`);
    }
    expect(seen.size).toBe(9);
  });

  it("flicking straight up picks 1", () => {
    expect(radialPick(0, -100, 10)).toBe(1);
  });

  it("a drag shorter than the dead zone picks nothing", () => {
    expect(radialPick(0, -5, 10)).toBe(0);
    expect(radialPick(3, 4, 10)).toBe(0); // length 5 < 10
  });

  it("flicking toward a dot picks that dot's digit", () => {
    for (let d = 1; d <= 9; d++) {
      const { x, y } = radialDot(d);
      expect(radialPick(x * 60, y * 60, 20)).toBe(d);
    }
  });
});
