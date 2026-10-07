import { hashSeed, mulberry32, pick, pickWeighted, randInt, randRange, shuffle } from "../../src/engine/rng";

describe("rng", () => {
  it("is deterministic per seed and differs across seeds", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const sa = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(sa);
    expect(Array.from({ length: 5 }, c)).not.toEqual(sa);
    for (const x of sa) expect(x >= 0 && x < 1).toBe(true);
  });

  it("helpers stay in range", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const n = randInt(r, 9);
      expect(n >= 0 && n < 9).toBe(true);
      const m = randRange(r, 2, 5);
      expect(m >= 2 && m <= 5).toBe(true);
    }
    expect(["x"]).toContain(pick(r, ["x"]));
    expect(() => pick(r, [])).toThrow();
  });

  it("shuffle is a permutation", () => {
    const arr = Array.from({ length: 30 }, (_, i) => i);
    const out = shuffle(mulberry32(1), [...arr]);
    expect([...out].sort((x, y) => x - y)).toEqual(arr);
    expect(out).not.toEqual(arr);
  });

  it("pickWeighted respects zero weights", () => {
    const r = mulberry32(3);
    for (let i = 0; i < 100; i++) expect(pickWeighted(r, ["a", "b", "c"], [0, 1, 0])).toBe("b");
  });

  it("hashSeed is stable and separator-aware", () => {
    expect(hashSeed("2026-10-07", "killer")).toBe(hashSeed("2026-10-07", "killer"));
    expect(hashSeed("ab", "c")).not.toBe(hashSeed("a", "bc"));
  });
});
