import {
  attacks,
  cellAt,
  cellName,
  colOf,
  decodeRegions,
  encodeRegions,
  inUnit,
  isConnected,
  makeBoard,
  neighbours,
  orthogonalNeighbours,
  parseCellName,
  regionCells,
  regionRows,
  rowOf,
  touching,
  unitAt,
  unitCells,
  unitId,
  unitsOf,
} from "../../../src/engine/queens/geometry";

describe("queens geometry", () => {
  it("row/col/cell round-trip for every size", () => {
    for (let n = 5; n <= 11; n++)
      for (let c = 0; c < n * n; c++) {
        expect(cellAt(rowOf(c, n), colOf(c, n), n)).toBe(c);
        expect(parseCellName(cellName(c, n), n)).toBe(c);
      }
    expect(cellName(0, 8)).toBe("r1c1");
    expect(cellName(cellAt(2, 3, 8), 8)).toBe("r3c4");
    expect(cellName(120, 11)).toBe("r11c11");
    expect(parseCellName("R10C2", 11)).toBe(cellAt(9, 1, 11));
    expect(parseCellName("r9c1", 8)).toBe(null);
    expect(parseCellName("r0c1", 8)).toBe(null);
    expect(parseCellName("x", 8)).toBe(null);
  });

  it("8-neighbourhood and orthogonal neighbours", () => {
    const n = 6;
    expect(neighbours(0, n)).toEqual([1, 6, 7]);
    expect(neighbours(cellAt(2, 2, n), n)).toEqual([7, 8, 9, 13, 15, 19, 20, 21]);
    expect(neighbours(35, n)).toEqual([28, 29, 34]);
    expect(orthogonalNeighbours(0, n)).toEqual([1, 6]);
    expect(orthogonalNeighbours(cellAt(2, 2, n), n)).toEqual([8, 13, 15, 20]);
    expect(touching(0, 7, n)).toBe(true);
    expect(touching(0, 2, n)).toBe(false);
    expect(touching(0, 0, n)).toBe(false);
    // the right edge does not wrap to the next row
    expect(touching(cellAt(0, 5, n), cellAt(1, 0, n), n)).toBe(false);
    expect(neighbours(cellAt(0, 5, n), n)).toEqual([4, 10, 11]);
  });

  it("region encoding round-trips and tolerates separators", () => {
    const regions = [0, 0, 1, 10, 35, 2];
    expect(encodeRegions(regions)).toBe("001az2");
    expect(decodeRegions("001az2")).toEqual(regions);
    expect(decodeRegions("00 1A/z|2\n")).toEqual(regions);
    expect(() => decodeRegions("00#")).toThrow();
    expect(() => encodeRegions([36])).toThrow();
    expect(regionRows(decodeRegions("0011" + "2233" + "2233" + "0011"), 4)).toEqual(["0011", "2233", "2233", "0011"]);
  });

  it("connectivity is orthogonal only", () => {
    const n = 5;
    expect(isConnected([0, 1, 6], n)).toBe(true);
    expect(isConnected([0, 5, 10, 11], n)).toBe(true);
    expect(isConnected([0, 5], n)).toBe(true); // vertical pair
    expect(isConnected([0, 6], n)).toBe(false); // diagonal only
    expect(isConnected([4, 5], n)).toBe(false); // r1c5 and r2c1 are not adjacent
    expect(isConnected([7], n)).toBe(true);
    expect(isConnected([], n)).toBe(false);
  });

  it("board units, attacks and lookups", () => {
    const regions = decodeRegions(["00011", "02211", "02331", "44431", "44441"].join(""));
    const n = 5;
    const board = makeBoard({ n, regions });
    expect(board.units.map((u) => unitId(u, n))).toEqual(Array.from({ length: 15 }, (_, i) => i));
    expect(unitAt(0, n)).toEqual({ type: "region", index: 0 });
    expect(unitAt(6, n)).toEqual({ type: "row", index: 1 });
    expect(unitAt(14, n)).toEqual({ type: "col", index: 4 });
    expect(unitCells(board, { type: "region", index: 2 })).toEqual([6, 7, 11]);
    expect(regionCells(regions, 2)).toEqual([6, 7, 11]);
    expect(unitCells(board, { type: "row", index: 1 })).toEqual([5, 6, 7, 8, 9]);
    expect(unitCells(board, { type: "col", index: 1 })).toEqual([1, 6, 11, 16, 21]);
    expect(unitsOf(board, 7)).toEqual([
      { type: "region", index: 2 },
      { type: "row", index: 1 },
      { type: "col", index: 2 },
    ]);
    expect(inUnit(board, 7, { type: "region", index: 2 })).toBe(true);
    expect(inUnit(board, 7, { type: "col", index: 3 })).toBe(false);
    // A queen on r2c3 (cell 7, region 2) rules out row 2, column 3, region 2 and its neighbours.
    expect(attacks(board, 7)).toEqual([1, 2, 3, 5, 6, 8, 9, 11, 12, 13, 17, 22]);
    expect(board.attack[7 * 25 + 22]).toBe(1);
    expect(board.attack[7 * 25 + 7]).toBe(0);
    expect(board.attack[7 * 25 + 24]).toBe(0);
  });
});
