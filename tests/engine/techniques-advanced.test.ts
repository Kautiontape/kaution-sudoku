import { aic, xChain, xyChain } from "../../src/engine/techniques/chains";
import { simpleColoring } from "../../src/engine/techniques/coloring";
import { finnedSwordfish, finnedXWing, jellyfish, swordfish, xWing } from "../../src/engine/techniques/fish";
import { emptyRectangle, skyscraper, twoStringKite } from "../../src/engine/techniques/single-digit";
import { bugPlusOne, uniqueRectangle } from "../../src/engine/techniques/uniqueness";
import { wWing, xyWing, xyzWing } from "../../src/engine/techniques/wings";
import { boxOnly, colOnly, linkStrings, marksOf, marksUnique, rowOnly } from "./advanced-helpers";
import { cage, cell, classic, elims, explainOf, places, stateWith, withDigits } from "./helpers";

const open = () => stateWith(withDigits({}));
const cols = (r: number, cs: number[], d: number) => cs.map((c) => `r${r}c${c}-${d}`);
/** Eliminations of d from the given columns in every row except `skip`. */
const colElims = (columns: number[], skip: number[], d: number): string[] =>
  [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((r) => !skip.includes(r)).flatMap((r) => cols(r, columns, d)).sort();

describe("fish", () => {
  it("x-wing in rows: 5s of rows 2 and 7 locked into columns 3 and 8", () => {
    const s = open();
    rowOnly(s, 5, 2, [3, 8]);
    rowOnly(s, 5, 7, [3, 8]);
    const step = xWing.find(s);
    expect(elims(step)).toEqual(colElims([3, 8], [2, 7], 5));
    expect(step!.explain).toMatchObject({
      kind: "fish",
      size: 2,
      digit: 5,
      baseKind: "row",
      base: [
        { kind: "row", index: 1 },
        { kind: "row", index: 6 },
      ],
      cover: [
        { kind: "col", index: 2 },
        { kind: "col", index: 7 },
      ],
    });
    expect(marksOf(step, ["key"])).toEqual(["r2c3-5:key", "r2c8-5:key", "r7c3-5:key", "r7c8-5:key"]);
    // Every other 5 is shown as context, and no candidate is marked twice.
    expect(marksOf(step, ["digit"])).toContain("r1c1-5:digit");
    expect(marksUnique(step)).toBe(true);
    expect(step!.tier).toBe(3);
    expect(step!.rating).toBe(3.2);
  });

  it("x-wing in columns", () => {
    const s = open();
    colOnly(s, 9, 1, [4, 9]);
    colOnly(s, 9, 5, [4, 9]);
    const step = xWing.find(s);
    expect(elims(step)).toEqual(
      ["r4c2", "r4c3", "r4c4", "r4c6", "r4c7", "r4c8", "r4c9", "r9c2", "r9c3", "r9c4", "r9c6", "r9c7", "r9c8", "r9c9"]
        .map((c) => `${c}-9`)
        .sort(),
    );
    expect(step!.explain).toMatchObject({ baseKind: "col", digit: 9 });
  });

  it("swordfish: three rows whose 5s fit in three columns", () => {
    const s = open();
    rowOnly(s, 5, 1, [2, 5]);
    rowOnly(s, 5, 5, [5, 8]);
    rowOnly(s, 5, 9, [2, 8]);
    expect(xWing.find(s)).toBeNull();
    const step = swordfish.find(s);
    expect(elims(step)).toEqual(colElims([2, 5, 8], [1, 5, 9], 5));
    expect(step!.explain).toMatchObject({ kind: "fish", size: 3 });
  });

  it("jellyfish: four rows, four columns", () => {
    const s = open();
    rowOnly(s, 6, 1, [1, 4]);
    rowOnly(s, 6, 3, [4, 6]);
    rowOnly(s, 6, 5, [6, 9]);
    rowOnly(s, 6, 7, [1, 9]);
    expect(swordfish.find(s)).toBeNull();
    const step = jellyfish.find(s);
    expect(elims(step)).toEqual(colElims([1, 4, 6, 9], [1, 3, 5, 7], 6));
    expect(step!.tier).toBe(4);
  });
});

describe("finned fish", () => {
  it("finned x-wing: the fin's box loses the digit in the cover columns", () => {
    const s = open();
    rowOnly(s, 5, 2, [3, 8]);
    rowOnly(s, 5, 7, [3, 8, 9]);
    expect(xWing.find(s)).toBeNull();
    const step = finnedXWing.find(s);
    expect(elims(step)).toEqual(["r8c8-5", "r9c8-5"]);
    expect(step!.explain).toMatchObject({ kind: "finned-fish", size: 2, digit: 5, fins: [62], sashimi: false });
    expect(marksOf(step, ["alt"])).toEqual(["r7c9-5:alt"]);
    expect(marksOf(step, ["key"])).toEqual(["r2c3-5:key", "r2c8-5:key", "r7c3-5:key", "r7c8-5:key"]);
  });

  it("sashimi x-wing: a corner may be missing", () => {
    const s = open();
    rowOnly(s, 5, 2, [3, 8]);
    rowOnly(s, 5, 7, [8, 9]);
    const step = finnedXWing.find(s);
    expect(elims(step)).toEqual(["r8c8-5", "r9c8-5"]);
    expect(step!.explain).toMatchObject({ sashimi: true });
  });

  it("finned swordfish", () => {
    const s = open();
    rowOnly(s, 5, 1, [2, 5]);
    rowOnly(s, 5, 5, [5, 8]);
    rowOnly(s, 5, 9, [2, 7, 8]);
    expect(swordfish.find(s)).toBeNull();
    const step = finnedSwordfish.find(s);
    expect(elims(step)).toEqual(["r7c8-5", "r8c8-5"]);
    expect(step!.explain).toMatchObject({ kind: "finned-fish", size: 3 });
  });
});

describe("single-digit patterns", () => {
  it("skyscraper in rows: the tops' common peers lose the digit", () => {
    const s = open();
    rowOnly(s, 4, 3, [2, 6]);
    rowOnly(s, 4, 7, [2, 5]);
    expect(xWing.find(s)).toBeNull();
    const step = skyscraper.find(s);
    expect(elims(step)).toEqual(["r1c5-4", "r2c5-4", "r8c6-4", "r9c6-4"]);
    expect(step!.explain).toMatchObject({
      kind: "skyscraper",
      digit: 4,
      lines: [
        { kind: "row", index: 2 },
        { kind: "row", index: 6 },
      ],
      baseLine: { kind: "col", index: 1 },
      base: [cell("r3c2"), cell("r7c2")],
      tops: [cell("r3c6"), cell("r7c5")],
    });
    expect(linkStrings(step)).toEqual(["r3c6-4=r3c2-4", "r3c2-4-r7c2-4", "r7c2-4=r7c5-4"]);
    expect(marksOf(step, ["alt"])).toEqual(["r3c6-4:alt", "r7c5-4:alt"]);
    expect(marksUnique(step)).toBe(true);
  });

  it("skyscraper in columns", () => {
    const s = open();
    colOnly(s, 8, 1, [2, 6]);
    colOnly(s, 8, 9, [2, 5]);
    const step = skyscraper.find(s);
    expect(elims(step)).toEqual(["r5c2-8", "r5c3-8", "r6c7-8", "r6c8-8"]);
    expect(step!.explain).toMatchObject({ baseLine: { kind: "row", index: 1 } });
  });

  it("two-string kite: a row pair and a column pair joined in a box", () => {
    const s = open();
    rowOnly(s, 4, 2, [1, 7]);
    colOnly(s, 4, 3, [1, 8]);
    expect(skyscraper.find(s)).toBeNull();
    const step = twoStringKite.find(s);
    expect(elims(step)).toEqual(["r8c7-4"]);
    expect(step!.explain).toMatchObject({
      kind: "two-string-kite",
      digit: 4,
      row: { kind: "row", index: 1 },
      col: { kind: "col", index: 2 },
      box: { kind: "box", index: 0 },
      rowCells: [cell("r2c1"), cell("r2c7")],
      colCells: [cell("r1c3"), cell("r8c3")],
    });
    expect(linkStrings(step)).toEqual(["r2c7-4=r2c1-4", "r2c1-4-r1c3-4", "r1c3-4=r8c3-4"]);
  });

  it("empty rectangle with a column pair", () => {
    const s = open();
    boxOnly(s, 7, 1, ["r1c2", "r2c1", "r2c3", "r3c2"]);
    colOnly(s, 7, 6, [2, 7]);
    const step = emptyRectangle.find(s);
    expect(elims(step)).toEqual(["r7c2-7"]);
    expect(step!.explain).toMatchObject({
      kind: "empty-rectangle",
      digit: 7,
      box: { kind: "box", index: 0 },
      boxRow: { kind: "row", index: 1 },
      boxCol: { kind: "col", index: 1 },
      pair: [cell("r2c6"), cell("r7c6")],
      pairLine: { kind: "col", index: 5 },
      target: cell("r7c2"),
    });
    expect(marksOf(step, ["key"])).toEqual(["r1c2-7:key", "r2c1-7:key", "r2c3-7:key", "r3c2-7:key"]);
  });

  it("empty rectangle with a row pair", () => {
    const s = open();
    boxOnly(s, 3, 9, ["r7c8", "r8c7", "r8c9"]);
    rowOnly(s, 3, 2, [3, 8]);
    const step = emptyRectangle.find(s);
    expect(elims(step)).toEqual(["r8c3-3"]);
    expect(step!.explain).toMatchObject({ pair: [cell("r2c8"), cell("r2c3")], target: cell("r8c3") });
  });
});

describe("wings", () => {
  it("xy-wing: pivot r2c2 {3,7} with pincers r2c8 {3,5} and r6c2 {5,7}", () => {
    const s = stateWith(withDigits({}), { r2c2: "37", r2c8: "35", r6c2: "57" });
    const step = xyWing.find(s);
    expect(elims(step)).toEqual(["r6c8-5"]);
    expect(step!.explain).toMatchObject({ kind: "xy-wing", pivot: cell("r2c2"), pincers: [cell("r2c8"), cell("r6c2")], x: 3, y: 7, z: 5 });
    expect(marksOf(step, ["key"])).toEqual(["r2c2-3:key", "r2c2-7:key", "r2c8-3:key", "r6c2-7:key"]);
    expect(marksOf(step, ["alt"])).toEqual(["r2c8-5:alt", "r6c2-5:alt"]);
    expect(step!.rating).toBe(4.2);
  });

  it("xy-wing in killer: a pincer may see the pivot only through their cage", () => {
    const p = withDigits({}, [cage(0, 4, ["r1c1", "r2c4"])]);
    const s = stateWith(p, { r1c1: "12", r2c4: "13", r5c1: "23" });
    const step = xyWing.find(s);
    expect(step!.explain).toMatchObject({ pivot: cell("r1c1"), pincers: [cell("r2c4"), cell("r5c1")], z: 3 });
    expect(elims(step)).toEqual(["r2c1-3", "r5c4-3"]);
  });

  it("xyz-wing: the pivot holds all three digits", () => {
    const s = stateWith(withDigits({}), { r5c5: "149", r5c2: "19", r4c6: "49" });
    expect(xyWing.find(s)).toBeNull();
    const step = xyzWing.find(s);
    expect(elims(step)).toEqual(["r5c4-9", "r5c6-9"]);
    expect(step!.explain).toMatchObject({ kind: "xyz-wing", pivot: cell("r5c5"), pincers: [cell("r4c6"), cell("r5c2")], x: 4, y: 1, z: 9 });
  });

  it("w-wing: two {3,8} cells joined by a strong link on 3", () => {
    const s = stateWith(withDigits({}), { r1c2: "38", r8c6: "38" });
    colOnly(s, 3, 4, [1, 8]);
    const step = wWing.find(s);
    expect(elims(step)).toEqual(["r1c6-8", "r8c2-8"]);
    expect(step!.explain).toMatchObject({
      kind: "w-wing",
      cells: [cell("r1c2"), cell("r8c6")],
      x: 3,
      y: 8,
      link: [cell("r1c4"), cell("r8c4")],
      linkHouse: { kind: "col", index: 3 },
    });
    expect(linkStrings(step)).toEqual(["r1c2-3-r1c4-3", "r1c4-3=r8c4-3", "r8c4-3-r8c6-3"]);
  });
});

describe("simple colouring", () => {
  it("colour trap: a cell that sees both colours", () => {
    const s = open();
    rowOnly(s, 6, 1, [2, 7]);
    colOnly(s, 6, 7, [1, 5]);
    rowOnly(s, 6, 5, [4, 7]);
    colOnly(s, 6, 4, [5, 8]);
    rowOnly(s, 6, 8, [1, 4]);
    expect(skyscraper.find(s)).toBeNull();
    const step = simpleColoring.find(s);
    expect(elims(step)).toEqual(["r2c1-6", "r3c1-6", "r7c2-6", "r9c2-6"]);
    expect(step!.explain).toMatchObject({
      kind: "simple-coloring",
      rule: "trap",
      digit: 6,
      on: [cell("r1c2"), cell("r5c7"), cell("r8c4")],
      off: [cell("r1c7"), cell("r5c4"), cell("r8c1")],
    });
    expect(marksOf(step, ["on", "off"])).toEqual([
      "r1c2-6:on",
      "r1c7-6:off",
      "r5c4-6:off",
      "r5c7-6:on",
      "r8c1-6:off",
      "r8c4-6:on",
    ]);
    expect(step!.links!.every((l) => l.strong)).toBe(true);
    expect(step!.links).toHaveLength(5);
    expect(marksUnique(step)).toBe(true);
  });

  it("colour wrap: two cells of one colour share a box, so that colour is false", () => {
    const s = open();
    rowOnly(s, 2, 1, [1, 5]);
    colOnly(s, 2, 5, [1, 6]);
    rowOnly(s, 2, 6, [2, 5]);
    colOnly(s, 2, 2, [3, 6]);
    const step = simpleColoring.find(s);
    expect(elims(step)).toEqual(["r1c1-2", "r3c2-2", "r6c5-2"]);
    expect(step!.explain).toMatchObject({
      rule: "wrap",
      on: [cell("r1c5"), cell("r6c2")],
      off: [cell("r1c1"), cell("r3c2"), cell("r6c5")],
      clash: { cells: [cell("r1c1"), cell("r3c2")], house: { kind: "box", index: 0 } },
    });
    expect(marksOf(step, ["on"])).toEqual(["r1c5-2:on", "r6c2-2:on"]);
  });
});

describe("uniqueness", () => {
  it("unique rectangle type 1: the one cell with extras loses the pair", () => {
    const s = stateWith(withDigits({}), { r1c1: "26", r1c4: "26", r3c1: "26", r3c4: "269" });
    const step = uniqueRectangle.find(s);
    expect(elims(step)).toEqual(["r3c4-2", "r3c4-6"]);
    expect(step!.explain).toMatchObject({
      kind: "unique-rectangle",
      type: 1,
      digits: [2, 6],
      corners: [cell("r1c1"), cell("r1c4"), cell("r3c1"), cell("r3c4")],
      floor: [cell("r1c1"), cell("r1c4"), cell("r3c1")],
      roof: [cell("r3c4")],
    });
    expect(uniqueRectangle.assumesUnique).toBe(true);
    expect(uniqueRectangle.classicOnly).toBe(true);
  });

  it("unique rectangle type 2: the shared extra digit is in one of the roof cells", () => {
    const s = stateWith(withDigits({}), { r1c1: "26", r1c4: "26", r3c1: "267", r3c4: "267" });
    const step = uniqueRectangle.find(s);
    expect(elims(step)).toEqual(["r3c2-7", "r3c3-7", "r3c5-7", "r3c6-7", "r3c7-7", "r3c8-7", "r3c9-7"]);
    expect(step!.explain).toMatchObject({ type: 2, extra: 7, floor: [cell("r1c1"), cell("r1c4")], roof: [cell("r3c1"), cell("r3c4")] });
  });

  it("unique rectangle type 4: one pair digit is locked into the roof, so the other goes", () => {
    const s = stateWith(withDigits({}), { r1c1: "26", r1c4: "26", r3c1: "2678", r3c4: "269" });
    rowOnly(s, 2, 3, [1, 4]);
    const step = uniqueRectangle.find(s);
    expect(elims(step)).toEqual(["r3c1-6", "r3c4-6"]);
    expect(step!.explain).toMatchObject({ type: 4, house: { kind: "row", index: 2 }, locked: 2, removed: 6 });
  });

  it("no unique rectangle across four boxes", () => {
    const s = stateWith(withDigits({}), { r1c1: "26", r1c4: "26", r4c1: "26", r4c4: "269" });
    expect(uniqueRectangle.find(s)).toBeNull();
  });

  it("BUG+1: every cell but one has two candidates, so the odd one takes the digit seen three times", () => {
    // From a solved grid, empty every 1, 2 and 3: 1-cells get {1,2}, 2-cells {2,3}, 3-cells {1,3}.
    // That bivalue graveyard has each digit twice per house; r1c8 (a 1) also keeps 3.
    const solution = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
    const p = classic(solution.replace(/[123]/g, "."));
    const s = stateWith(p);
    const pair: Record<string, number> = { "1": 0b0110, "2": 0b1100, "3": 0b1010 };
    for (let c = 0; c < 81; c++) if ("123".includes(solution[c]!)) s.cand[c] = pair[solution[c]!]!;
    s.cand[cell("r1c8")] = 0b1110;
    const step = bugPlusOne.find(s);
    expect(places(step)).toEqual(["r1c8=3"]);
    expect(step!.explain).toMatchObject({ kind: "bug-plus-one", cell: cell("r1c8"), digit: 3, others: [1, 2] });
    // Without the extra candidate it's a plain graveyard: nothing to say.
    s.cand[cell("r1c8")] = 0b0110;
    expect(bugPlusOne.find(s)).toBeNull();
  });
});

interface ChainX {
  variant: string;
  nodes: { cell: number; digit: number }[];
  links: { strong: boolean; via: string; house?: { kind: string; index: number } }[];
  ends: string;
}
const chainText = (step: Parameters<typeof explainOf>[0]): string =>
  explainOf<ChainX>(step)
    .nodes.map((n, i) => `${i ? (i % 2 ? "=" : "-") : ""}r${Math.floor(n.cell / 9) + 1}c${(n.cell % 9) + 1}-${n.digit}`)
    .join("");

describe("chains", () => {
  it("x-chain: strong links in rows joined by weak links in columns", () => {
    const s = open();
    rowOnly(s, 7, 1, [2, 6]);
    rowOnly(s, 7, 4, [6, 8]);
    rowOnly(s, 7, 8, [3, 8]);
    expect(skyscraper.find(s)).toBeNull();
    expect(simpleColoring.find(s)).toBeNull();
    const step = xChain.find(s);
    expect(chainText(step)).toBe("r1c2-7=r1c6-7-r4c6-7=r4c8-7-r8c8-7=r8c3-7");
    expect(elims(step)).toEqual(["r2c3-7", "r3c3-7", "r7c2-7", "r9c2-7"]);
    const x = explainOf<ChainX>(step);
    expect(x).toMatchObject({ kind: "chain", variant: "x-chain", ends: "digit" });
    expect(x.links[0]).toEqual({ strong: true, via: "house", house: { kind: "row", index: 0 } });
    expect(x.links[1]).toEqual({ strong: false, via: "peer", house: { kind: "col", index: 5 } });
    expect(marksOf(step, ["on", "off"])).toEqual([
      "r1c2-7:off",
      "r1c6-7:on",
      "r4c6-7:off",
      "r4c8-7:on",
      "r8c3-7:on",
      "r8c8-7:off",
    ]);
    expect(linkStrings(step)[0]).toBe("r1c2-7=r1c6-7");
    expect(step!.tier).toBe(5);
    expect(marksUnique(step)).toBe(true);
  });

  it("xy-chain: four two-candidate cells", () => {
    const s = stateWith(withDigits({}), { r1c1: "12", r1c5: "23", r5c5: "34", r5c9: "14" });
    expect(xyWing.find(s)).toBeNull();
    const step = xyChain.find(s);
    expect(chainText(step)).toBe("r1c1-1=r1c1-2-r1c5-2=r1c5-3-r5c5-3=r5c5-4-r5c9-4=r5c9-1");
    expect(elims(step)).toEqual(["r1c9-1", "r5c1-1"]);
    const x = explainOf<ChainX>(step);
    expect(x.links[0]).toEqual({ strong: true, via: "cell" });
    expect(x.links[1]).toEqual({ strong: false, via: "peer", house: { kind: "row", index: 0 } });
  });

  it("aic: mixes a row pair, a column pair and a two-candidate cell", () => {
    const s = stateWith(withDigits({}), { r6c2: "47" });
    rowOnly(s, 4, 1, [1, 5]);
    colOnly(s, 7, 5, [1, 6]);
    expect(xChain.find(s)).toBeNull();
    expect(xyChain.find(s)).toBeNull();
    const step = aic.find(s);
    expect(chainText(step)).toBe("r1c1-4=r1c5-4-r1c5-7=r6c5-7-r6c2-7=r6c2-4");
    expect(elims(step)).toEqual(["r2c2-4", "r3c2-4", "r4c1-4", "r5c1-4", "r6c1-4"]);
    expect(explainOf<ChainX>(step)).toMatchObject({ variant: "aic", ends: "digit" });
  });

  it("aic with different digits at the ends: the ends see each other", () => {
    const s = stateWith(withDigits({}), { r5c1: "13", r5c9: "2345" });
    colOnly(s, 1, 1, [1, 5]);
    rowOnly(s, 3, 5, [1, 9]);
    colOnly(s, 2, 9, [1, 5]);
    const step = aic.find(s);
    expect(chainText(step)).toBe("r1c1-1=r5c1-1-r5c1-3=r5c9-3-r5c9-2=r1c9-2");
    expect(elims(step)).toEqual(["r1c1-2", "r1c9-1"]);
    expect(explainOf<ChainX>(step)).toMatchObject({ ends: "cross" });
  });
});

describe("killer: cages give weak links, never strong ones", () => {
  it("x-chain through a cage: two cage-mates can't both be 7", () => {
    const p = withDigits({}, [cage(0, 10, ["r1c6", "r8c8"])]);
    const s = stateWith(p);
    rowOnly(s, 7, 1, [2, 6]);
    rowOnly(s, 7, 8, [3, 8]);
    expect(skyscraper.find(s)).toBeNull();
    const step = xChain.find(s);
    expect(chainText(step)).toBe("r1c2-7=r1c6-7-r8c8-7=r8c3-7");
    expect(explainOf<ChainX>(step).links[1]).toEqual({ strong: false, via: "cage" });
    expect(elims(step)).toEqual(["r2c3-7", "r3c3-7", "r7c2-7", "r9c2-7"]);
  });

  it("a cage with only two places for a digit is not a strong link (the cage may not hold it at all)", () => {
    const p = withDigits({}, [cage(0, 10, ["r2c2", "r5c5"])]);
    const s = stateWith(p);
    // Every row, column and box still has 7 in many places; only the cage has "two places".
    expect(simpleColoring.find(s)).toBeNull();
    expect(xChain.find(s)).toBeNull();
    expect(aic.find(s)).toBeNull();
  });
});
