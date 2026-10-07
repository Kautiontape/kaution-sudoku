# Architecture

## Stack decision: web (TypeScript), not Godot

| | Web (TS + Vite) | Godot (GDScript/C#) |
|---|---|---|
| Android delivery | PWA, installable, no store needed | APK export, sideload or Play |
| Testing | Vitest (unit/property) + Playwright (e2e, mobile viewport) — both headless, fast, CI-friendly | GUT/gdUnit4 work, but slower loop and weaker headless UI testing |
| Engine reuse | Same TS engine runs in browser, Node generator scripts, Web Worker | Generator would be a separate project or a headless Godot run |
| Claude Code ergonomics | Excellent: `npm test` gives a tight feedback loop | Usable, but more friction (scene files, editor-only state) |
| What the app actually is | A grid, panels, text. No physics, no animation-heavy scenes | Godot's strengths go unused |

Web wins. If a native APK is wanted later, wrap the PWA with Capacitor or a TWA.

## Layout

```
src/
  engine/              # pure TS, no DOM. 100% unit-tested.
    types.ts           # Puzzle, Cage, Cell, Grid, Candidates, Step
    geometry.ts        # rows/cols/boxes, peers, house membership
    combos.ts          # cage combination tables  ✅ implemented
    calc.ts            # calculator tape model    ✅ implemented
    validate.ts        # puzzle/solution validation ✅ implemented
    candidates.ts      # true candidate computation from a state
    exact.ts           # exact solver (DLX or bitmask backtracking) — counts solutions, for uniqueness
    logical.ts         # human-style solver: loop over techniques by tier, return Step[]
    techniques/        # one file per technique, each: find(state) → Step | null
    hints.ts           # Step → HintLadder (rungs 1–4 text + highlights)
    audit.ts           # player notes vs true candidates
    region.ts          # 45-rule region analysis (innies/outies) — shared by calculator + techniques
    generate.ts        # solved grid + cage partition + uniqueness loop
    grade.ts           # run logical solver, compute difficulty + "interesting" filter
  ui/                  # rendering + input; thin, calls engine
  main.ts
scripts/
  generate-pack.ts     # node script: generate N puzzles, grade, filter, write public/packs/*.json
tests/
  engine/*.test.ts     # Vitest
  e2e/*.spec.ts        # Playwright, Pixel-sized viewport
  fixtures/            # puzzle JSON fixtures
```

## Key types (see `src/engine/types.ts`)

- `CellId` = 0..80, row-major. `r = Math.floor(id/9)`, `c = id % 9`. Display as `r{1-9}c{1-9}`.
- `Cage { id, sum, cells: CellId[] }`
- `Puzzle { id, cages, givens?, solution?, meta? }`
- Candidates are a `Uint16Array(81)` bitmask (bit 1..9). Fast and trivially cloneable.
- `Step { technique, tier, placements, eliminations, focus: { cells, cages, houses }, explain: StructuredReason }`
  - `explain` is data (numbers, cell ids, cage ids), never prose. `hints.ts` turns it into text. This keeps hint text testable and localizable, and makes LLM rephrasing optional and safe.

## Solver design

- **Exact solver** answers "how many solutions (stop at 2)?". Used by the generator and by validation. Bitmask backtracking with cage-sum pruning (min/max remaining sum) is plenty fast for 9×9.
- **Logical solver** repeatedly asks each technique, in tier order, for a step; applies the first one; repeats. Output is the full `Step[]` path. Used for grading, hints, and classifying the player's own moves.
- Techniques are pure and individually tested with hand-built fixtures (`tests/fixtures/techniques/*.json`): a state, the expected step.

### Technique tiers (initial)

| Tier | Techniques |
|---|---|
| 1 | Naked single, hidden single, single-combo cage (e.g. 2-cell 17 = {8,9}), cage-complete (last cell of a cage) |
| 2 | Cage combo elimination (digits not in any valid combo), cage no-repeat elimination, must-contain digit locked in a house (cage/house pointing) |
| 3 | 45 rule: innies/outies for single houses (1 leftover cell or 2-cell sum) |
| 4 | Naked/hidden pairs & triples, 45 rule across 2–3 houses, combo-vs-house intersection |
| 5 | Cage splitting / hidden (virtual) cages, X-wing, larger innie/outie sets |

`region.ts` does the 45-rule math once; the technique and the calculator's Region mode both call it, so what the hint says and what the calculator shows can never disagree.

## Generator

1. Random solved grid (shuffle a base pattern: permute digits, rows within bands, bands, cols within stacks, stacks, transpose). Seeded PRNG.
2. Random cage partition: grow cages from random seeds to target sizes (weighted 2–5 cells), never allowing a repeated digit inside a cage.
3. Uniqueness: exact solver count. If >1 solution, find a cell where solutions differ and merge/split a cage near it; retry. Cap attempts, discard on failure.
4. Grade with the logical solver. Discard if unsolvable by implemented techniques (record that — it's a signal to add a technique) or if the "interesting" filter rejects it.
5. Emit pack JSON.

All randomness goes through a seeded PRNG so every puzzle is reproducible from its seed.

## Performance

Engine runs in a Web Worker in the app, so hint search never blocks the UI. Target: hint in < 50 ms on a mid-range phone; generator ≥ 20 graded puzzles/sec in Node.
