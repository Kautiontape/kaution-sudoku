/**
 * Queens techniques, in the order the logical solver tries them (easiest first). Each `find`
 * returns the easiest instance it sees (scan order breaks ties), or null. Every returned step
 * changes the state. Steps carry structured `explain` data only; hints.ts turns it into text.
 *
 * | id             | tier | rating  | idea                                                          |
 * |----------------|------|---------|---------------------------------------------------------------|
 * | last-cell      | 1    | 1.0     | a region/row/column has one possible cell left                |
 * | region-in-line | 2    | 2.0     | a region's cells all lie in one row/column                    |
 * | line-in-region | 2    | 2.2     | a row/column's cells all lie in one region                    |
 * | touch          | 2–3  | 2.5–3.0 | a queen on X would wipe out every cell of some unit           |
 * | confinement    | 3–4  | 3.5–4.6 | k regions inside k lines, or k lines inside k regions (k ≥ 2) |
 * | contradiction  | 5    | 5.1+    | a queen on X forces a chain that empties some unit            |
 */
import { colOf, rowOf, touching } from "./geometry";
import type { QState } from "./state";
import type { QCell, QStep, Unit } from "./types";

export interface QTechnique {
  id: string;
  /** Easiest tier this technique produces. */
  tier: number;
  /** Hardest tier it produces (touch and confinement span two). */
  maxTier: number;
  /** Rating of its easiest instance. */
  rating: number;
  /** The easiest instance whose tier is at most `maxTier` (default 5), or null. */
  find(state: QState, maxTier?: number): QStep | null;
}

export type LineType = "row" | "col";

export type LastCellExplain = { kind: "last-cell"; unit: Unit; cell: QCell };
/** `cells`: the region's possible cells, all in `line`. */
export type RegionInLineExplain = { kind: "region-in-line"; region: number; line: Unit; cells: QCell[] };
/** `cells`: the line's possible cells, all in `region`. */
export type LineInRegionExplain = { kind: "line-in-region"; line: Unit; region: number; cells: QCell[] };
/** A queen on any of `cells` would rule out all of `unitCells` (the unit's possible cells). */
export type TouchExplain = { kind: "touch"; unit: Unit; unitCells: QCell[]; cells: QCell[] };
/**
 * form "regions-in-lines": the possible cells of `regions` all lie in `lines`;
 * form "lines-in-regions": the possible cells of `lines` all lie in `regions`.
 * `cells`: the possible cells of the confined units.
 */
export type ConfinementExplain = {
  kind: "confinement";
  form: "regions-in-lines" | "lines-in-regions";
  lineType: LineType;
  k: number;
  regions: number[];
  lines: number[];
  cells: QCell[];
};
/** One forced placement: `unit` had only `cell` left. */
export type ChainLink = { cell: QCell; unit: Unit };
/** A queen on `cell` forces `chain` in order, after which `empty` has no possible cell. */
export type ContradictionExplain = { kind: "contradiction"; cell: QCell; chain: ChainLink[]; empty: Unit };

export type QExplain =
  | LastCellExplain
  | RegionInLineExplain
  | LineInRegionExplain
  | TouchExplain
  | ConfinementExplain
  | ContradictionExplain;

/** Longest forced chain a contradiction step may narrate. */
export const MAX_CHAIN = 6;

const sortNum = (a: number, b: number) => a - b;
const uniqSorted = (xs: readonly number[]): number[] => [...new Set(xs)].sort(sortNum);

function makeStep(
  technique: string,
  tier: number,
  rating: number,
  placements: QCell[],
  eliminations: QCell[],
  cells: QCell[],
  units: Unit[],
  explain: QExplain,
): QStep {
  const focus = { cells: uniqSorted(cells), rows: [] as number[], cols: [] as number[], regions: [] as number[] };
  for (const u of units) {
    const list = u.type === "row" ? focus.rows : u.type === "col" ? focus.cols : focus.regions;
    if (!list.includes(u.index)) list.push(u.index);
  }
  focus.rows.sort(sortNum);
  focus.cols.sort(sortNum);
  focus.regions.sort(sortNum);
  return {
    technique,
    tier,
    rating,
    placements: uniqSorted(placements),
    eliminations: uniqSorted(eliminations),
    focus,
    explain,
  };
}

interface UnitScan {
  unit: Unit;
  id: number;
  /** Possible cells, ascending. */
  possible: QCell[];
  queen: boolean;
}

/** Every unit in unit-id order: regions, rows, columns. */
function scanUnits(s: QState): UnitScan[] {
  const { board, possible, queens } = s;
  return board.units.map((unit, id) => {
    const cells: QCell[] = [];
    let queen = false;
    for (const c of board.cellsByUnit[id]!) {
      if (queens[c]) queen = true;
      else if (possible[c]) cells.push(c);
    }
    return { unit, id, possible: cells, queen };
  });
}

const lineIndex = (c: QCell, type: LineType, n: number): number => (type === "row" ? rowOf(c, n) : colOf(c, n));

function possibleList(s: QState): QCell[] {
  const out: QCell[] = [];
  for (let c = 0; c < s.possible.length; c++) if (s.possible[c]) out.push(c);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Tier 1

export const lastCell: QTechnique = {
  id: "last-cell",
  tier: 1,
  maxTier: 1,
  rating: 1.0,
  find(s) {
    for (const u of scanUnits(s)) {
      if (u.queen || u.possible.length !== 1) continue;
      const cell = u.possible[0]!;
      return makeStep("last-cell", 1, 1.0, [cell], [], [cell], [u.unit], { kind: "last-cell", unit: u.unit, cell });
    }
    return null;
  },
};

// ---------------------------------------------------------------------------------------------
// Tier 2

export const regionInLine: QTechnique = {
  id: "region-in-line",
  tier: 2,
  maxTier: 2,
  rating: 2.0,
  find(s, maxTier = 5) {
    if (maxTier < 2) return null;
    const { board } = s;
    const { n } = board;
    for (const u of scanUnits(s)) {
      if (u.unit.type !== "region" || u.queen || u.possible.length < 2) continue;
      for (const type of ["row", "col"] as const) {
        const index = lineIndex(u.possible[0]!, type, n);
        if (!u.possible.every((c) => lineIndex(c, type, n) === index)) continue;
        const line: Unit = { type, index };
        const lineCells = board.cellsByUnit[(type === "row" ? n : 2 * n) + index]!;
        const elims = lineCells.filter((c) => s.possible[c] && board.regions[c] !== u.unit.index);
        if (!elims.length) continue;
        return makeStep("region-in-line", 2, 2.0, [], elims, u.possible, [u.unit, line], {
          kind: "region-in-line",
          region: u.unit.index,
          line,
          cells: u.possible,
        });
      }
    }
    return null;
  },
};

export const lineInRegion: QTechnique = {
  id: "line-in-region",
  tier: 2,
  maxTier: 2,
  rating: 2.2,
  find(s, maxTier = 5) {
    if (maxTier < 2) return null;
    const { board } = s;
    for (const u of scanUnits(s)) {
      if (u.unit.type === "region" || u.queen || u.possible.length < 2) continue;
      const g = board.regions[u.possible[0]!]!;
      if (!u.possible.every((c) => board.regions[c] === g)) continue;
      const lineType = u.unit.type;
      const elims = board.cellsByUnit[g]!.filter(
        (c) => s.possible[c] && lineIndex(c, lineType, board.n) !== u.unit.index,
      );
      if (!elims.length) continue;
      const region: Unit = { type: "region", index: g };
      return makeStep("line-in-region", 2, 2.2, [], elims, u.possible, [u.unit, region], {
        kind: "line-in-region",
        line: u.unit,
        region: g,
        cells: u.possible,
      });
    }
    return null;
  },
};

/**
 * Touch: a queen on X would rule out every possible cell of a unit X isn't in. Tier 2 when X simply
 * touches all of a unit's (at most 3) remaining cells; tier 3 when it takes a mix of touching and
 * sharing a row, column or region, or more cells. Smallest units first; all X for that unit are
 * eliminated together.
 */
export const touch: QTechnique = {
  id: "touch",
  tier: 2,
  maxTier: 3,
  rating: 2.5,
  find(s, maxTier = 5) {
    const { board } = s;
    const { n, size, attack } = board;
    const units = scanUnits(s)
      .filter((u) => !u.queen && u.possible.length >= 2)
      .sort((a, b) => a.possible.length - b.possible.length || a.id - b.id);
    const candidates = possibleList(s);
    for (const cls of [2, 3]) {
      if (cls > maxTier) break;
      for (const u of units) {
        const hits: QCell[] = [];
        let tier = 0;
        for (const x of candidates) {
          let all = true;
          let allTouch = true;
          for (const c of u.possible) {
            if (!attack[x * size + c]) {
              all = false;
              break;
            }
            if (!touching(x, c, n)) allTouch = false;
          }
          if (!all) continue;
          const t = allTouch && u.possible.length <= 3 ? 2 : 3;
          if (t > cls) continue;
          hits.push(x);
          tier = Math.max(tier, t);
        }
        if (!hits.length) continue;
        return makeStep("touch", tier, tier === 2 ? 2.5 : 3.0, [], hits, [...hits, ...u.possible], [u.unit], {
          kind: "touch",
          unit: u.unit,
          unitCells: u.possible,
          cells: hits,
        });
      }
    }
    return null;
  },
};

// ---------------------------------------------------------------------------------------------
// Tiers 3–4

const popcount = (x: number): number => {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
};

const bitsOf = (mask: number): number[] => {
  const out: number[] = [];
  for (let i = 0; mask >> i; i++) if ((mask >> i) & 1) out.push(i);
  return out;
};

/** Calls fn with each k-subset of items (lexicographic); stops early when fn returns a value. */
function firstCombination<T>(items: readonly number[], k: number, fn: (combo: number[]) => T | null): T | null {
  const idx = Array.from({ length: k }, (_, i) => i);
  const m = items.length;
  if (k > m) return null;
  for (;;) {
    const res = fn(idx.map((i) => items[i]!));
    if (res !== null) return res;
    let i = k - 1;
    while (i >= 0 && idx[i] === m - k + i) i--;
    if (i < 0) return null;
    idx[i]!++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1]! + 1;
  }
}

const confinementTier = (k: number): number => (k === 2 ? 3 : 4);
const confinementRating = (k: number): number => (k === 2 ? 3.5 : k === 3 ? 4.0 : k === 4 ? 4.3 : 4.6);

/**
 * Confinement (k ≥ 2): k regions whose possible cells lie within the same k rows (or columns)
 * own those lines, so other regions' cells there go. Dually, k rows (or columns) whose possible
 * cells lie within the same k regions use up those regions, so the regions' other cells go.
 * k regions in k lines is the same deduction as the other (m-k) lines in the other (m-k)
 * regions, so k only runs up to half the open units; smaller k is reported first.
 */
export const confinement: QTechnique = {
  id: "confinement",
  tier: 3,
  maxTier: 4,
  rating: 3.5,
  find(s, maxTier = 5) {
    if (maxTier < 3) return null;
    const { board, possible } = s;
    const { n, size, regions } = board;
    const scans = scanUnits(s);
    // masks: region -> rows/cols it can still use; row/col -> regions it can still use
    const regLines = { row: new Array<number>(n).fill(0), col: new Array<number>(n).fill(0) };
    const lineRegs = { row: new Array<number>(n).fill(0), col: new Array<number>(n).fill(0) };
    for (let c = 0; c < size; c++) {
      if (!possible[c]) continue;
      const g = regions[c]!;
      const r = rowOf(c, n);
      const col = colOf(c, n);
      regLines.row[g]! |= 1 << r;
      regLines.col[g]! |= 1 << col;
      lineRegs.row[r]! |= 1 << g;
      lineRegs.col[col]! |= 1 << g;
    }
    const open = (lo: number) =>
      scans.slice(lo, lo + n).flatMap((u) => (!u.queen && u.possible.length > 0 ? [u.unit.index] : []));
    const openRegions = open(0);
    const openLines = { row: open(n), col: open(2 * n) };
    const half = Math.floor(openRegions.length / 2);

    for (let k = 2; k <= half; k++) {
      const tier = confinementTier(k);
      if (tier > maxTier) break;
      const rating = confinementRating(k);
      for (const lineType of ["row", "col"] as const) {
        const found = firstCombination(openRegions, k, (regs) => {
          let lines = 0;
          let regMask = 0;
          for (const g of regs) {
            lines |= regLines[lineType][g]!;
            regMask |= 1 << g;
          }
          if (popcount(lines) !== k) return null;
          const elims: QCell[] = [];
          for (let c = 0; c < size; c++)
            if (possible[c] && (lines >> lineIndex(c, lineType, n)) & 1 && !((regMask >> regions[c]!) & 1)) elims.push(c);
          if (!elims.length) return null;
          return buildConfinement("regions-in-lines", lineType, k, tier, rating, regs, bitsOf(lines), elims, s);
        });
        if (found) return found;
      }
      for (const lineType of ["row", "col"] as const) {
        const found = firstCombination(openLines[lineType], k, (lines) => {
          let regMask = 0;
          let lineMask = 0;
          for (const l of lines) {
            regMask |= lineRegs[lineType][l]!;
            lineMask |= 1 << l;
          }
          if (popcount(regMask) !== k) return null;
          const elims: QCell[] = [];
          for (let c = 0; c < size; c++)
            if (possible[c] && (regMask >> regions[c]!) & 1 && !((lineMask >> lineIndex(c, lineType, n)) & 1)) elims.push(c);
          if (!elims.length) return null;
          return buildConfinement("lines-in-regions", lineType, k, tier, rating, bitsOf(regMask), lines, elims, s);
        });
        if (found) return found;
      }
    }
    return null;
  },
};

function buildConfinement(
  form: ConfinementExplain["form"],
  lineType: LineType,
  k: number,
  tier: number,
  rating: number,
  regs: number[],
  lines: number[],
  elims: QCell[],
  s: QState,
): QStep {
  const { board } = s;
  const n = board.n;
  const confined =
    form === "regions-in-lines"
      ? regs.flatMap((g) => board.cellsByUnit[g]!)
      : lines.flatMap((l) => board.cellsByUnit[(lineType === "row" ? n : 2 * n) + l]!);
  const cells = uniqSorted(confined.filter((c) => s.possible[c]));
  const units: Unit[] = [
    ...regs.map((index): Unit => ({ type: "region", index })),
    ...lines.map((index): Unit => ({ type: lineType, index })),
  ];
  return makeStep("confinement", tier, rating, [], elims, cells, units, {
    kind: "confinement",
    form,
    lineType,
    k,
    regions: [...regs].sort(sortNum),
    lines: [...lines].sort(sortNum),
    cells,
  });
}

// ---------------------------------------------------------------------------------------------
// Tier 5

interface Hypothesis {
  chain: ChainLink[];
  empty: Unit;
}

/**
 * Assume a queen on x and propagate only attacks and last-cell placements. Returns the shortest
 * explanation found for the unit it empties: the forced placements are trimmed to the ones the
 * contradiction actually depends on. Null if nothing empties within the depth limit.
 */
export function assumeQueen(s: QState, x: QCell, maxChain = MAX_CHAIN): Hypothesis | null {
  if (!s.possible[x]) return null;
  const { board } = s;
  const { n, size, cellsByUnit, cellUnits, attacks } = board;
  const unitCount = 3 * n;
  const possible = s.possible.slice();
  /** Index (into `placed`) of the placement that first ruled each cell out; -1 = out before the assumption. */
  const killer = new Int16Array(size).fill(-1);
  const count = new Int16Array(unitCount);
  const done = new Uint8Array(unitCount);
  for (let c = 0; c < size; c++) {
    const ids = cellUnits[c]!;
    if (s.queens[c]) for (const id of ids) done[id] = 1;
    else if (possible[c]) for (const id of ids) count[id]!++;
  }
  const placed: { cell: QCell; unit: number }[] = [];
  const knock = (c: QCell, by: number) => {
    possible[c] = 0;
    killer[c] = by;
    for (const id of cellUnits[c]!) count[id]!--;
  };
  const place = (cell: QCell, unit: number) => {
    const by = placed.length;
    placed.push({ cell, unit });
    possible[cell] = 0;
    for (const id of cellUnits[cell]!) {
      count[id]!--;
      done[id] = 1;
    }
    for (const a of attacks[cell]!) if (possible[a]) knock(a, by);
  };
  /** Would a queen on c leave some other open unit with no cell? */
  const empties = (c: QCell): boolean => {
    const att = board.attack.subarray(c * size, (c + 1) * size);
    const own = cellUnits[c]!;
    for (let id = 0; id < unitCount; id++) {
      if (done[id] || own.includes(id)) continue;
      if (cellsByUnit[id]!.every((d) => !possible[d] || att[d])) return true;
    }
    return false;
  };

  place(x, -1);
  for (;;) {
    let emptyId = -1;
    for (let id = 0; id < unitCount; id++)
      if (!done[id] && count[id] === 0) {
        emptyId = id;
        break;
      }
    if (emptyId >= 0) return trim(emptyId);
    if (placed.length > n) return null;
    // forced placements: units with one possible cell. Prefer one that empties a unit at once.
    let pick = -1;
    let pickUnit = -1;
    for (let id = 0; id < unitCount; id++) {
      if (done[id] || count[id] !== 1) continue;
      const c = cellsByUnit[id]!.find((d) => possible[d])!;
      if (pick < 0) {
        pick = c;
        pickUnit = id;
      }
      if (empties(c)) {
        pick = c;
        pickUnit = id;
        break;
      }
    }
    if (pick < 0) return null;
    place(pick, pickUnit);
  }

  function trim(emptyId: number): Hypothesis | null {
    const needed = new Uint8Array(placed.length);
    needed[0] = 1;
    const need = (cells: readonly QCell[], except: QCell) => {
      for (const c of cells) if (c !== except && killer[c]! >= 0) needed[killer[c]!] = 1;
    };
    need(cellsByUnit[emptyId]!, -1);
    for (let i = placed.length - 1; i >= 1; i--)
      if (needed[i]) need(cellsByUnit[placed[i]!.unit]!, placed[i]!.cell);
    const chain: ChainLink[] = [];
    for (let i = 1; i < placed.length; i++)
      if (needed[i]) chain.push({ cell: placed[i]!.cell, unit: board.units[placed[i]!.unit]! });
    if (chain.length > maxChain) return null;
    return { chain, empty: board.units[emptyId]! };
  }
}

export const contradiction: QTechnique = {
  id: "contradiction",
  tier: 5,
  maxTier: 5,
  rating: 5.1,
  find(s, maxTier = 5) {
    if (maxTier < 5) return null;
    let best: { x: QCell; h: Hypothesis } | null = null;
    for (const x of possibleList(s)) {
      const h = assumeQueen(s, x, best ? best.h.chain.length - 1 : MAX_CHAIN);
      if (h && (!best || h.chain.length < best.h.chain.length)) {
        best = { x, h };
        if (h.chain.length === 0) break;
      }
    }
    if (!best) return null;
    const { x, h } = best;
    const rating = Math.round((5 + 0.1 * Math.max(1, h.chain.length)) * 10) / 10;
    return makeStep(
      "contradiction",
      5,
      rating,
      [],
      [x],
      [x, ...h.chain.map((l) => l.cell)],
      [...h.chain.map((l) => l.unit), h.empty],
      { kind: "contradiction", cell: x, chain: h.chain, empty: h.empty },
    );
  },
};

/** Ordered registry: the logical solver asks each in turn and applies the first step found. */
export const QUEENS_REGISTRY: readonly QTechnique[] = [
  lastCell,
  regionInLine,
  lineInRegion,
  touch,
  confinement,
  contradiction,
];

export function techniqueById(id: string): QTechnique | undefined {
  return QUEENS_REGISTRY.find((t) => t.id === id);
}
