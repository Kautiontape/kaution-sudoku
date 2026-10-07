# Milestones

Each milestone ends with `npm run check` green (typecheck + lint-free build + all tests). Don't start the next one until the current one is green and committed.

## M0 — Scaffold ✅ (done — generator script is a stub until M2)
- Vite + TS + Vitest + Playwright configured.
- `types.ts`, `geometry.ts`, `combos.ts`, `calc.ts`, `validate.ts` implemented with tests.
- Placeholder UI that renders an empty 9×9 grid; one Playwright smoke test.

## M1 — Exact solver + candidates
- `candidates.ts`: true candidates from (puzzle, placed digits), honoring row/col/box/cage-no-repeat and cage-combo feasibility.
- `exact.ts`: `countSolutions(puzzle, limit=2)` and `solve(puzzle)`.
- Tests: solves the fixture in `tests/fixtures/`; detects a deliberately ambiguous puzzle (2 solutions); property test: for 50 random seeded generated grids, any cage layout derived from the solution yields that solution among its solutions.

## M2 — Generator v0
- Seeded PRNG (`mulberry32` or similar), solved-grid shuffler, cage partitioner, uniqueness loop.
- `scripts/generate-pack.ts --count 50 --seed 1 --out public/packs/dev.json`.
- Tests: same seed → identical puzzle; every emitted puzzle passes `validatePuzzle` and has exactly one solution.

## M3 — Playable board
- Render cages (dashed outlines, sum labels top-left), digits, pencil marks.
- Input: select, place, pencil toggle, long-press pencil, undo/redo, auto-clear peers' notes (incl. cage peers).
- "Why it's wrong" messages for provable rule breaks (cage already has digit, house already has digit).
- Load puzzles from `public/packs/dev.json`.
- Playwright: place digits by tapping, verify undo, verify cage-duplicate error message, at 412×915 (Pixel-ish).

## M4 — Calculator
- Tape mode wired to `calc.ts`: buttons, tap cage label / filled cell / empty cell to insert terms, live result incl. symbolic form.
- Region mode via `region.ts`: select houses → auto equation with innies/outies.
- Combination helper for selected cage and for tape equations.
- Pin result as virtual cage.
- Playwright: reproduce `45 − [12] − [21] − 3 = r3c2 + r3c3 = 9` by taps on a fixture.

## M5 — Logical solver tiers 1–3 + hints
- `techniques/` tier 1–3, `logical.ts`, `hints.ts`, `audit.ts`.
- Hint ladder UI (rungs 0–4).
- Tests per technique with fixtures; ladder text snapshot tests; audit flags a planted impossible note.
- Golden test: logical solver fully solves a set of tier-≤3 fixtures, and every step's placements match the solution.

## M6 — Grading + interesting filter + real packs
- `grade.ts`, filter rules from SPEC §4. Generate Easy/Medium/Hard packs (200 each).
- Report script: distribution of hardest technique, rejection reasons, % unsolvable-by-implemented-techniques.

## M7 — Tiers 4–5, Expert pack
- Remaining techniques until ≥ 95% of generated Expert candidates are logically solvable.
- Expert pack.

## M8 — PWA polish
- Manifest, service worker (offline), install prompt, dark mode, haptics, stats screen, technique progress, daily puzzle.

## Later
Training packs, mistake replay, OCR import, optional LLM rephrasing of hints.
