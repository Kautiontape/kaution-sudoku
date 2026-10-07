import type { CellId, House } from "./types";

export const rowOf = (c: CellId): number => Math.floor(c / 9);
export const colOf = (c: CellId): number => c % 9;
export const boxOf = (c: CellId): number => Math.floor(rowOf(c) / 3) * 3 + Math.floor(colOf(c) / 3);
export const cellAt = (row: number, col: number): CellId => row * 9 + col;

/** User-facing name, 1-indexed: r3c4. */
export const cellName = (c: CellId): string => `r${rowOf(c) + 1}c${colOf(c) + 1}`;

/** Parse "r3c4" -> CellId. Returns null if malformed. */
export function parseCellName(s: string): CellId | null {
  const m = /^r([1-9])c([1-9])$/i.exec(s.trim());
  if (!m) return null;
  return cellAt(Number(m[1]) - 1, Number(m[2]) - 1);
}

export function houseCells(h: House): CellId[] {
  const out: CellId[] = [];
  for (let i = 0; i < 9; i++) {
    if (h.kind === "row") out.push(cellAt(h.index, i));
    else if (h.kind === "col") out.push(cellAt(i, h.index));
    else {
      const br = Math.floor(h.index / 3) * 3;
      const bc = (h.index % 3) * 3;
      out.push(cellAt(br + Math.floor(i / 3), bc + (i % 3)));
    }
  }
  return out;
}

export const ALL_HOUSES: House[] = (["row", "col", "box"] as const).flatMap((kind) =>
  Array.from({ length: 9 }, (_, index) => ({ kind, index })),
);

export function housesOf(c: CellId): House[] {
  return [
    { kind: "row", index: rowOf(c) },
    { kind: "col", index: colOf(c) },
    { kind: "box", index: boxOf(c) },
  ];
}

/** Row/col/box peers (20 cells), excluding the cell itself. Cage peers are handled by the caller. */
export const PEERS: CellId[][] = Array.from({ length: 81 }, (_, c) => {
  const s = new Set<CellId>();
  for (const h of housesOf(c)) for (const p of houseCells(h)) if (p !== c) s.add(p);
  return [...s].sort((a, b) => a - b);
});

export function sharesHouse(a: CellId, b: CellId): boolean {
  return rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b);
}

/** Flat house index 0..26: rows 0-8, cols 9-17, boxes 18-26 (same order as ALL_HOUSES). */
export function houseIndex(h: House): number {
  return (h.kind === "row" ? 0 : h.kind === "col" ? 9 : 18) + h.index;
}
export function houseAt(i: number): House {
  return { kind: i < 9 ? "row" : i < 18 ? "col" : "box", index: i % 9 };
}

/** HOUSE_CELLS[houseIndex] = the 9 cells of that house. */
export const HOUSE_CELLS: CellId[][] = ALL_HOUSES.map(houseCells);

/** CELL_HOUSES[cell] = [rowHouse, colHouse, boxHouse] as flat house indices. */
export const CELL_HOUSES: [number, number, number][] = Array.from({ length: 81 }, (_, c) => [
  rowOf(c),
  9 + colOf(c),
  18 + boxOf(c),
]);

const BOX_NAMES = [
  "top-left",
  "top-middle",
  "top-right",
  "middle-left",
  "center",
  "middle-right",
  "bottom-left",
  "bottom-middle",
  "bottom-right",
];

/** User-facing house name usable mid-sentence: "row 3", "column 4", "the top-left box". */
export function houseName(h: House): string {
  if (h.kind === "row") return `row ${h.index + 1}`;
  if (h.kind === "col") return `column ${h.index + 1}`;
  return `the ${BOX_NAMES[h.index]} box`;
}

export function sameHouse(a: House, b: House): boolean {
  return a.kind === b.kind && a.index === b.index;
}

/** The houses (as flat indices) that contain every given cell. */
export function commonHouses(cells: readonly CellId[]): number[] {
  if (cells.length === 0) return [];
  const [r, c, b] = CELL_HOUSES[cells[0]!]!;
  return [r, c, b].filter((h) => cells.every((x) => CELL_HOUSES[x]!.includes(h)));
}
