/** Text helpers for hint templates. All user-facing wording conventions live here. */
import { digitsOf } from "../combos";
import { cellName, colOf, houseName, rowOf } from "../geometry";
import type { Cage, CellId, Digit, Elimination, House, Puzzle } from "../types";

export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "a", "a and b", "a, b and c". */
export function list(items: readonly string[], conj = "and"): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${conj} ${items[items.length - 1]}`;
}

export const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export const cellList = (cells: readonly CellId[], conj = "and"): string => list(cells.map(cellName), conj);

export const digitList = (ds: readonly Digit[], conj = "and"): string => list(ds.map(String), conj);

/** Digits of a mask as "1, 2 and 4". */
export const maskList = (mask: number, conj = "and"): string => digitList(digitsOf(mask), conj);

/** A combination as "1+2+4". */
export const comboText = (mask: number): string => digitsOf(mask).join("+");

/** Several combinations: "1+8, 2+7 and 4+5". */
export const comboList = (masks: readonly number[], conj = "and"): string => list(masks.map(comboText), conj);

export const house = (h: House): string => houseName(h);
export const House_ = (h: House): string => cap(houseName(h));

/** "rows 1–2", "columns 4, 5 and 6", "the top-left and top-middle boxes", or a single house name. */
export function regionName(houses: readonly House[]): string {
  if (houses.length === 1) return houseName(houses[0]!);
  const kind = houses[0]!.kind;
  const idx = houses.map((h) => h.index + 1);
  const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1]! + 1);
  if (kind === "row" || kind === "col") {
    const word = kind === "row" ? "rows" : "columns";
    return consecutive ? `${word} ${idx[0]}–${idx[idx.length - 1]}` : `${word} ${list(idx.map(String))}`;
  }
  return `the ${list(houses.map((h) => houseName(h).replace(/^the /, "").replace(/ box$/, "")))} boxes`;
}

/** The cell that carries a cage's sum label (top-most, then left-most). */
export function cageAnchor(cage: Cage): CellId {
  return [...cage.cells].sort((a, b) => rowOf(a) - rowOf(b) || colOf(a) - colOf(b))[0]!;
}

/** "the 17 cage at r1c1" — sum plus the cell showing its label. */
export function cageName(p: Puzzle, id: number): string {
  const cage = p.cages.find((c) => c.id === id);
  if (!cage) return "the cage";
  return `the ${cage.sum} cage at ${cellName(cageAnchor(cage))}`;
}

/** Group eliminations by digit: "3 from r1c4 and r1c5; 7 from r2c2". */
export function elimText(elims: readonly Elimination[]): string {
  const byDigit = new Map<Digit, CellId[]>();
  for (const e of elims) byDigit.set(e.digit, [...(byDigit.get(e.digit) ?? []), e.cell]);
  const parts = [...byDigit.entries()].sort((a, b) => a[0] - b[0]).map(([d, cs]) => `${d} from ${cellList(cs)}`);
  return parts.join("; ");
}

/** Group eliminations by cell when they all hit the same digit set: "r1c4 and r1c5 lose 3 and 7". */
export function removeSentence(elims: readonly Elimination[]): string {
  return `Remove ${elimText(elims)}.`;
}

/** The relation between two cells, for "sees" sentences: "same row", "same column", "same box". */
export function relation(a: CellId, b: CellId, p?: Puzzle): string {
  if (rowOf(a) === rowOf(b)) return "same row";
  if (colOf(a) === colOf(b)) return "same column";
  if (Math.floor(rowOf(a) / 3) === Math.floor(rowOf(b) / 3) && Math.floor(colOf(a) / 3) === Math.floor(colOf(b) / 3))
    return "same box";
  if (p?.cages.some((c) => c.cells.includes(a) && c.cells.includes(b))) return "same cage";
  return "linked";
}

export { cellName };
