/**
 * Queens board geometry. Cells are 0..n*n-1, row-major. Units are the n rows, the n columns and
 * the n coloured regions. User-facing cell names follow the sudoku side: `r{row}c{col}`, 1-indexed.
 */
import type { QCell, Unit, UnitType } from "./types";

export const rowOf = (c: QCell, n: number): number => Math.floor(c / n);
export const colOf = (c: QCell, n: number): number => c % n;
export const cellAt = (row: number, col: number, n: number): QCell => row * n + col;

/** User-facing name, 1-indexed: r3c4. */
export const cellName = (c: QCell, n: number): string => `r${rowOf(c, n) + 1}c${colOf(c, n) + 1}`;

/** Parse "r3c4" -> cell of an n×n board. Returns null if malformed or off the board. */
export function parseCellName(s: string, n: number): QCell | null {
  const m = /^r(\d+)c(\d+)$/i.exec(s.trim());
  if (!m) return null;
  const r = Number(m[1]) - 1;
  const c = Number(m[2]) - 1;
  if (r < 0 || r >= n || c < 0 || c >= n) return null;
  return cellAt(r, c, n);
}

/** The cells touching c (sharing a side or a corner), row-major. */
export function neighbours(c: QCell, n: number): QCell[] {
  const r0 = rowOf(c, n);
  const c0 = colOf(c, n);
  const out: QCell[] = [];
  for (let r = r0 - 1; r <= r0 + 1; r++)
    for (let cc = c0 - 1; cc <= c0 + 1; cc++)
      if (r >= 0 && r < n && cc >= 0 && cc < n && (r !== r0 || cc !== c0)) out.push(cellAt(r, cc, n));
  return out;
}

/** The cells sharing a side with c, row-major. Regions are connected through these. */
export function orthogonalNeighbours(c: QCell, n: number): QCell[] {
  const r = rowOf(c, n);
  const cc = colOf(c, n);
  const out: QCell[] = [];
  if (r > 0) out.push(c - n);
  if (cc > 0) out.push(c - 1);
  if (cc < n - 1) out.push(c + 1);
  if (r < n - 1) out.push(c + n);
  return out;
}

/** True if a and b are different cells that share a side or a corner. */
export function touching(a: QCell, b: QCell, n: number): boolean {
  return a !== b && Math.abs(rowOf(a, n) - rowOf(b, n)) <= 1 && Math.abs(colOf(a, n) - colOf(b, n)) <= 1;
}

export function rowCells(row: number, n: number): QCell[] {
  return Array.from({ length: n }, (_, c) => cellAt(row, c, n));
}

export function colCells(col: number, n: number): QCell[] {
  return Array.from({ length: n }, (_, r) => cellAt(r, col, n));
}

export function regionCells(regions: readonly number[], region: number): QCell[] {
  const out: QCell[] = [];
  for (let c = 0; c < regions.length; c++) if (regions[c] === region) out.push(c);
  return out;
}

/** True if the cells form one orthogonally connected group (false for no cells). */
export function isConnected(cells: readonly QCell[], n: number): boolean {
  if (cells.length === 0) return false;
  const inSet = new Set(cells);
  const seen = new Set<QCell>([cells[0]!]);
  const stack: QCell[] = [cells[0]!];
  while (stack.length) {
    const c = stack.pop()!;
    for (const nb of orthogonalNeighbours(c, n))
      if (inSet.has(nb) && !seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
  }
  return seen.size === inSet.size;
}

/** Order in which techniques scan units: regions first (easiest to see), then rows, then columns. */
export const UNIT_TYPES: readonly UnitType[] = ["region", "row", "col"];

/** Flat unit id: regions 0..n-1, rows n..2n-1, columns 2n..3n-1 (the UNIT_TYPES order). */
export function unitId(u: Unit, n: number): number {
  return (u.type === "region" ? 0 : u.type === "row" ? n : 2 * n) + u.index;
}

export function unitAt(id: number, n: number): Unit {
  return { type: UNIT_TYPES[Math.floor(id / n)]!, index: id % n };
}

export function sameUnit(a: Unit, b: Unit): boolean {
  return a.type === b.type && a.index === b.index;
}

/** Precomputed lookups for one puzzle layout. Build once per puzzle with `makeBoard`. */
export interface QBoard {
  n: number;
  size: number;
  regions: readonly number[];
  /** All 3n units in unit-id order. */
  units: readonly Unit[];
  /** Cells of each unit, by unit id. */
  cellsByUnit: readonly QCell[][];
  /** The three unit ids of each cell: [region, row, col]. */
  cellUnits: readonly [number, number, number][];
  /** The 8-neighbourhood of each cell. */
  neighbours: readonly QCell[][];
  /** Cells a queen on each cell rules out: its row, column, region and touching cells. */
  attacks: readonly QCell[][];
  /** attack[a * size + b] = 1 when a queen on a rules out b (never for a === b). */
  attack: Uint8Array;
}

export function makeBoard(p: { n: number; regions: readonly number[] }): QBoard {
  const { n, regions } = p;
  const size = n * n;
  if (regions.length !== size) throw new Error(`Expected ${size} region entries, got ${regions.length}`);
  const units = Array.from({ length: 3 * n }, (_, id) => unitAt(id, n));
  const cellsByUnit: QCell[][] = units.map(() => []);
  const cellUnits: [number, number, number][] = [];
  for (let c = 0; c < size; c++) {
    const ids: [number, number, number] = [regions[c]!, n + rowOf(c, n), 2 * n + colOf(c, n)];
    cellUnits.push(ids);
    for (const id of ids) cellsByUnit[id]!.push(c);
  }
  const nbs = Array.from({ length: size }, (_, c) => neighbours(c, n));
  const attack = new Uint8Array(size * size);
  const attacks: QCell[][] = [];
  for (let a = 0; a < size; a++) {
    const [g, r, col] = cellUnits[a]!;
    const row = attack.subarray(a * size, (a + 1) * size);
    for (const id of [g, r, col]) for (const b of cellsByUnit[id]!) row[b] = 1;
    for (const b of nbs[a]!) row[b] = 1;
    row[a] = 0;
    const list: QCell[] = [];
    for (let b = 0; b < size; b++) if (row[b]) list.push(b);
    attacks.push(list);
  }
  return { n, size, regions, units, cellsByUnit, cellUnits, neighbours: nbs, attacks, attack };
}

export function unitCells(board: QBoard, u: Unit): QCell[] {
  return board.cellsByUnit[unitId(u, board.n)]!;
}

/** The region, row and column of a cell, in that order. */
export function unitsOf(board: QBoard, c: QCell): Unit[] {
  return board.cellUnits[c]!.map((id) => board.units[id]!);
}

export function inUnit(board: QBoard, c: QCell, u: Unit): boolean {
  return board.cellUnits[c]!.includes(unitId(u, board.n));
}

/** Cells a queen on c rules out (row, column, region, touching), ascending. */
export function attacks(board: QBoard, c: QCell): QCell[] {
  return board.attacks[c]!;
}

const REGION_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Compact region layout: one character per cell, 0-9 then a-z. */
export function encodeRegions(regions: readonly number[]): string {
  return regions
    .map((g) => {
      const ch = REGION_CHARS[g];
      if (ch === undefined || !Number.isInteger(g)) throw new RangeError(`Region ${g} can't be encoded`);
      return ch;
    })
    .join("");
}

/** Inverse of `encodeRegions`. Ignores whitespace, '/', '|' and ',' so layouts can be written row by row. */
export function decodeRegions(s: string): number[] {
  const out: number[] = [];
  for (const ch of s.toLowerCase()) {
    if (/[\s/|,]/.test(ch)) continue;
    const g = REGION_CHARS.indexOf(ch);
    if (g < 0) throw new Error(`Bad region character "${ch}"`);
    out.push(g);
  }
  return out;
}

/** The layout as n strings, one per row (for fixtures and debugging). */
export function regionRows(regions: readonly number[], n: number): string[] {
  const s = encodeRegions(regions);
  return Array.from({ length: n }, (_, r) => s.slice(r * n, (r + 1) * n));
}
