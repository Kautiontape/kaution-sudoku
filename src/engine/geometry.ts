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
