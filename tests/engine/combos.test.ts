import fc from "fast-check";
import {
  cageCombos,
  comboSummary,
  digitsOf,
  filteredCombos,
  maskOf,
  maxSum,
  minSum,
  popcount,
} from "../../src/engine/combos";

/** Digits per combo, combos sorted lexicographically so order of the table doesn't matter. */
const asDigits = (masks: number[]) => masks.map(digitsOf).sort((a, b) => a.join().localeCompare(b.join()));

describe("cageCombos", () => {
  it("single-combo cages", () => {
    expect(asDigits(cageCombos(2, 17))).toEqual([[8, 9]]);
    expect(asDigits(cageCombos(2, 3))).toEqual([[1, 2]]);
    expect(asDigits(cageCombos(3, 6))).toEqual([[1, 2, 3]]);
    expect(asDigits(cageCombos(3, 24))).toEqual([[7, 8, 9]]);
    expect(asDigits(cageCombos(5, 35))).toEqual([[5, 6, 7, 8, 9]]);
    expect(asDigits(cageCombos(9, 45))).toEqual([[1, 2, 3, 4, 5, 6, 7, 8, 9]]);
  });

  it("multi-combo cages", () => {
    expect(asDigits(cageCombos(2, 9)).sort()).toEqual([[1, 8], [2, 7], [3, 6], [4, 5]].sort());
    expect(cageCombos(3, 15)).toHaveLength(8);
  });

  it("impossible sums return nothing", () => {
    expect(cageCombos(2, 2)).toEqual([]);
    expect(cageCombos(2, 18)).toEqual([]);
    expect(cageCombos(0, 0)).toEqual([]);
    expect(cageCombos(10, 45)).toEqual([]);
  });

  it("min/max sums", () => {
    expect([minSum(1), maxSum(1)]).toEqual([1, 9]);
    expect([minSum(3), maxSum(3)]).toEqual([6, 24]);
    expect([minSum(9), maxSum(9)]).toEqual([45, 45]);
  });

  it("property: every combo has the right size, sum, and distinct digits", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 45 }), (size, sum) => {
        for (const m of cageCombos(size, sum)) {
          const ds = digitsOf(m);
          expect(ds).toHaveLength(size);
          expect(popcount(m)).toBe(size);
          expect(ds.reduce((a, b) => a + b, 0)).toBe(sum);
        }
      }),
    );
  });
});

describe("filteredCombos / comboSummary", () => {
  it("include and exclude", () => {
    // 3-cell 15 containing a 9: {1,5,9},{2,4,9}
    expect(asDigits(filteredCombos(3, 15, { include: maskOf([9]) }))).toEqual([
      [1, 5, 9],
      [2, 4, 9],
    ]);
    // 2-cell 9 with no 1, 2, or 3: {4,5}
    expect(asDigits(filteredCombos(2, 9, { exclude: maskOf([1, 2, 3]) }))).toEqual([[4, 5]]);
  });

  it("must / can contain", () => {
    const s = comboSummary(filteredCombos(3, 15, { include: maskOf([9]) }));
    expect(digitsOf(s.must)).toEqual([9]);
    expect(digitsOf(s.can)).toEqual([1, 2, 4, 5, 9]);
    expect(comboSummary([])).toEqual({ must: 0, can: 0 });
  });
});
