# CLAUDE.md — Cage Coach

Killer sudoku PWA with a teaching hint ladder and an on-board sum calculator. Read `docs/SPEC.md` (what), `docs/ARCHITECTURE.md` (how), `docs/MILESTONES.md` (order). Work the next unfinished milestone.

## Commands
- `npm test` — Vitest unit tests (engine). Fast; run constantly.
- `npm run test:e2e` — Playwright (mobile viewport). Run before finishing a UI milestone.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run check` — typecheck + unit tests + build. Must be green before a milestone is "done".
- `npm run dev` — Vite dev server.
- `npm run gen -- --count 50 --seed 1 --out public/packs/dev.json` — puzzle pack generator (from M2).

## Rules
- **`src/engine/` is pure TypeScript.** No DOM, no `window`, no UI imports. It runs in Node (tests, generator) and a Web Worker.
- **Test-first for engine code.** Every technique gets a fixture test showing a state and the exact expected `Step`. Every bug fix gets a regression test.
- **Solvers never guess.** The logical solver only applies deductions a human could justify. Hints never come from the exact solver's search.
- **Hint text is generated from structured `Step.explain` data via templates.** No prose inside techniques. No LLM in the hint path.
- **The calculator's Region mode and the 45-rule technique share `region.ts`.** They must never disagree.
- **Cell naming in all user-facing text: `r{row}c{col}`, 1-indexed.** Internally `CellId` is 0..80 row-major.
- Candidates are `Uint16Array(81)` bitmasks (bits 1–9). Use helpers in `geometry.ts`/`combos.ts`; don't hand-roll bit math in UI code.
- All randomness via the seeded PRNG. No `Math.random()` in engine or generator.
- Keep UI framework-free (vanilla TS + DOM) unless a milestone explicitly says otherwise. Keep it small.
- Mobile-first: design and test at 412×915. Tap targets ≥ 44px.

## Puzzle JSON format
```json
{
  "id": "dev-0001",
  "cages": [{ "id": 0, "sum": 12, "cells": [0, 1] }],
  "givens": { "4": 3 },
  "solution": "534678912672195348...",
  "meta": { "seed": 1, "tier": 3, "techniques": ["hidden-single", "innies-outies"], "breakIn": "innies-outies" }
}
```
`solution` is an 81-char digit string. `givens` keys are CellIds.

## Definition of done (per milestone)
1. `npm run check` green.
2. New behavior has tests; e2e for user-visible flows.
3. Tick the milestone in `docs/MILESTONES.md` with a one-line note of anything deferred.
4. Commit.
