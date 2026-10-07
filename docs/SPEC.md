# Cage Coach — Product Spec

A killer sudoku app that teaches instead of tells. Hints climb a ladder from "look here" to "here's the answer," a sum calculator lives on the board, and puzzles are selected for interesting solve paths rather than dumped at random.

Target: installable PWA, Android-first (phone portrait), works offline. Desktop browser is a bonus.

---

## 1. Core play

- 9×9 killer: cages with sum clues, no givens required (some puzzles may have a few).
- Rules: rows/cols/boxes contain 1–9 once; cage cells sum to the clue; **no repeated digit inside a cage**.
- Input: tap cell → tap digit. Toggle pencil mode. Long-press digit = pencil without toggling.
- Multi-select cells (drag) for bulk pencil marks.
- Undo/redo, unlimited.
- Auto-remove pencil marks when a digit is placed in the same row/col/box/**cage**.
- Highlight: same digit, peers of the selected cell, and the selected cell's cage.

### Mistakes that teach
When a placement is wrong, don't just bump a counter. Say *why* it's wrong when a rule makes it provably wrong right now:
- "That cage already has a 7." (the bug that cost a mistake on 2026-10-07)
- "Row 6 already has a 5."
- "This 3-cell cage sums to 6, so it can only be {1,2,3}."

If it's only wrong against the solution (not provably wrong yet), say "That doesn't match the solution" and offer the hint ladder for that cell. Mistake limit is optional (off by default).

---

## 2. Hint ladder

Every hint comes from one logical step the solver found. The player climbs one rung per tap; each rung costs a little more (for stats, not for punishment).

| Rung | Shows | Example |
|---|---|---|
| 0 — Notes audit | Whether any of your pencil marks are impossible (count + region, not which) | "One of your notes in row 6 can't be right." |
| 1 — Where | Region highlight, no technique | "Look at the top-left box." |
| 2 — What | Technique name + a one-line nudge | "45 rule: the cages here nearly fill the box." |
| 3 — Why | Full reasoning with cells/cages highlighted, and arithmetic shown | "Cages 12 + 21 + given 3 = 36, leaving r3c2 + r3c3 = 9 …" |
| 4 — Do | Applies the step (placement or eliminations) | Places the digit / removes candidates |

Rules:
- Rung 0 runs first only if the audit finds a problem. Bad notes were the #1 reason the player got stuck; fixing them often unblocks without any further hint.
- A rung-0 follow-up tap reveals the exact bad mark(s).
- Hints always pick the **easiest** available step, not the next placement in reading order.
- Hints are generated from the player's current state, using true candidates (not the player's notes), but phrased relative to what's on the board.
- Hint text is templated per technique. No LLM in the hint path. (Optional later: LLM rephrasing of a structured step for a friendlier voice, offline-fallback to templates.)

### Technique tracking
Record which technique each hint used and whether the player later applied that technique unaided (the solver can classify the player's own placements by the easiest technique that justifies them). Show per-technique status: new / learning / solid.

---

## 3. Sum calculator ("the tape")

A slide-up panel with a running expression the player builds by tapping things.

### Tape mode (manual)
- Buttons: `45`, `+`, `−`, `=`, `⌫`, `C`, and a digit pad for literals.
- **Tap the board to insert a term:**
  - Tap a cage's sum label → inserts that cage (`[cage 12]`, value = clue).
  - Tap a filled cell → inserts its value (`r3c4=4`).
  - Tap an empty cell → inserts a **symbol** (`r3c2`). Subtracted symbols are "what's left over", so the tape reads as `… = 0` and is shown solved for the cells.
- Live result:
  - All numeric → a number. `45 − 8 − 12 = 25`.
  - With symbols: `45 − [12] − [21] − 3 − r3c2 − r3c3` → shows `r3c2 + r3c3 = 9`. Added cells (outies) land on the right: `r6c7 = 8 + r5c9`.
- Tapping an operator after the term flips its sign; tap a term chip to remove it.
- Example from the request: `45 − 8 − [12] + …`.

### Region mode (smart 45)
- Tap a row/col/box (or select any set of whole rows/cols/boxes; multiples of 45).
- The calculator auto-fills: `45·n − (cages fully inside) − (placed digits)` and lists the **innies** (cells in the region whose cage leaks out) and **outies** (cells outside the region whose cage leaks in).
- Shows the resulting equation, e.g. `r3c2 + r3c3 = 9` or `r6c7 = 7`.
- This is the main teaching tool for the technique the player kept missing.

### Combination helper
- With a cage selected: list every valid combo for its sum and size, crossing out combos ruled out by placed digits and current true candidates. Shows "must contain" and "can't contain" digits.
- Works on the tape result too: an equation `r3c2 + r3c3 = 9` gets the same combo list (as a 2-cell sum, repeats allowed only if cells don't share a house).

### Virtual cages
- "Pin" a tape/region result as a virtual cage (dashed outline in a different color). Virtual cages participate in combo helper and in the solver's hint logic for this game.

---

## 4. Puzzle library

- Generated offline by a script, shipped as a JSON pack, more packs downloadable later.
- Each puzzle stores: cages, solution, difficulty score, list of techniques required, the "break-in" technique, and a seed.
- Difficulty = hardest technique required, then step count at that tier as a tiebreaker.
- **Interesting filter** (reject a puzzle if):
  - It falls to singles + cage combos alone for the first 30+ placements at Hard/Expert.
  - It has no break-in deduction (the first progress isn't a 45-rule / combo / interaction step).
  - It needs a technique above its tier more than once.
  - Cage shapes are degenerate (too many 1-cell cages, a cage > 6 cells at low tiers, etc.).
- **Training packs:** puzzles chosen because they require a specific technique (e.g. "Innies/outies drill").
- Daily puzzle: deterministic by date from the pack.

---

## 5. Stats

Time, hints used per rung, mistakes, techniques applied unaided. No accounts, everything local. Optional export/import JSON.

---

## 6. Non-goals (v1)

- Classic sudoku, other variants (killer-X, jigsaw). Architecture should not block them.
- Accounts, cloud sync, leaderboards, ads, in-app purchases.
- Camera import of puzzles from other apps.

---

## 7. Ideas parking lot

- Scan-a-screenshot import (OCR the cage outlines) — would let the coach work on puzzles from other apps.
- "Explain my mistake" replay: rewind to the last state where the wrong digit was still possible and show what killed it.
- Cage-sum heatmap toggle: shade cages by how constrained they are (number of combos).
- Haptics on placement, Material You color theming on Android.
- Self-hostable puzzle pack server (static JSON on a homelab box).
