import { cageLoops, colorCages, insetLoop } from "../../src/ui/components/cage-paths";

describe("cage outline tracing", () => {
  it("a single cell is one square loop, clockwise", () => {
    expect(cageLoops([0])).toEqual([
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    ]);
  });

  it("an L-tromino has six corners", () => {
    // r1c1, r2c1, r2c2
    const loops = cageLoops([0, 9, 10]);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(6);
  });

  it("insetting moves corners inside the shape (concave corner included)", () => {
    const [loop] = cageLoops([0, 9, 10]);
    const inset = insetLoop(loop!, 0.1);
    // The concave corner at (1,1) moves to (0.9, 1.1): inside r1c1's right edge and r2c2's top edge.
    expect(inset.some(([x, y]) => Math.abs(x - 0.9) < 1e-9 && Math.abs(y - 1.1) < 1e-9)).toBe(true);
    for (const [x, y] of inset) {
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(0);
    }
  });

  it("colouring gives touching cages different colours", () => {
    const cages = [{ cells: [0, 1] }, { cells: [2, 3] }, { cells: [9, 10] }, { cells: [11, 12] }];
    const colors = colorCages(cages, 5);
    expect(colors[0]).not.toBe(colors[1]);
    expect(colors[0]).not.toBe(colors[2]);
    expect(colors[2]).not.toBe(colors[3]);
  });
});
