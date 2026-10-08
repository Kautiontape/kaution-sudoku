# Milestones

Each milestone ends with `npm run check` green (typecheck + unit tests + build) and, for UI work,
`npm run test:e2e` green.

## M0 — Scaffold ✅
Vite + TS + Vitest + Playwright; combo tables, calculator tape engine, validation.

## M1 — Exact solver + candidates ✅
`candidates.ts`, `exact.ts` (MRV + hidden-single forcing + cage pruning); patterned fixture counts
2 solutions; Wikipedia puzzle solves uniquely; layouts derived from a solution admit it.

## M2 — Generators ✅
Seeded PRNG, random solved grids, symmetric classic digging, killer cage partition with
logical-proof uniqueness and cage-splitting repair, Queens generator; parallel pack script.

## M3 — Playable boards ✅
Sudoku (classic + killer) and Queens boards, notes, long-press pencil, undo/redo, auto-clear notes
(incl. cage peers), "why it's wrong" messages, autosave/resume, keyboard. *Deferred: drag
multi-select for bulk notes on the sudoku board.*

## M4 — Calculator ⏳ (Region mode done)
The killer cage bar shows the selected cage's combinations, and its **Σ45 lens** is Region mode:
pick the selected cell's row, column or box and it writes out the 45-rule equation
("45 − (22+10) = 13, so r4c4 + r6c5 = 13") and rings the innies/outies — using the same
`region.ts` as the hint technique. *Deferred: the manual tape UI (`calc.ts` engine exists and is
tested), multi-house regions in the lens, pinned virtual cages.*

## M5 — Logical solver + hints ✅
Technique registry tiers 1–5 (sudoku, killer, queens), hint ladder with mistake and notes checks,
templates for every technique, SudokuWiki-style board visuals, Learn screen.

## M6 — Grading + packs ✅
Difficulty grading per mode; packs for every mode × difficulty. *Deferred: the full "interesting"
filter from the original spec (break-in requirements, early-singles rejection).*

## M7 — Advanced techniques ✅
Fish (incl. finned), single-digit patterns, wings, colouring, uniqueness (classic only), chains.

## M8 — PWA polish ✅ (mostly)
Manifest, icons, offline service worker, dark stage themes, haptics, effects levels, stats
(solved, best times, streak, per-technique hint counts), generative audio.
Learn screen worked examples: a real position per technique, drawn with the hint layer.
*Deferred: install prompt UI, daily puzzle, technique mastery (new / learning / solid).*

## Next
- Calculator tape UI and multi-house lens (M4).
- Technique mastery tracking by classifying the player's own placements.
- Training packs; "explain my mistake" replay.
