# Cage Coach — Product Spec

Puzzles that teach instead of tell. Three puzzle types, one coach: hints climb a ladder from
"look here" to "here's the answer", every hint is a human-style deduction with its reasoning drawn
on the board, and the whole thing feels like Tetris Effect — calm, luminous, and punctuated by
light and sound when things click.

Target: installable PWA, Android-first (phone portrait), works offline. Desktop browser works too
(keyboard supported).

---

## 1. Modes

### Classic sudoku
9×9, givens, rows/cols/boxes contain 1–9 once.

### Killer sudoku
Cages with sum clues, normally no givens. Rows/cols/boxes contain 1–9 once; cage cells sum to the
clue; **no repeated digit inside a cage**.

### Queens (colour regions)
N×N board (6–10) split into N coloured regions. Place N queens: exactly one per row, column and
region; no two queens touch, not even diagonally (they *may* share a long diagonal — this is the
LinkedIn "Queens" puzzle, not classic 8-queens).

### Difficulty
Easy / Medium / Hard / Expert per mode, graded by the hardest technique the logical solver needs
(see §4). Queens board size grows with difficulty (Easy 6–7, Medium 8, Hard 9, Expert 9–10).

---

## 2. Core play

- Sudoku: tap cell → tap digit. Notes mode toggle; **hold a digit on the pad = light that digit up
  across the grid** (places nothing; only a tap places). Erase, undo/redo (unlimited), auto-notes
  (killer auto-notes respect cage sums). Drag across cells — or Shift / Ctrl / ⌘-click — to
  select several; a digit then pencils into all of them (or comes out of all, if all have it),
  and Erase wipes them all (digits and notes), each as one undo step. A cell acts on release, not
  on press: pressing the selected cell to start a drag never pencils anything, while a plain tap
  on it repeats the last digit.
- Placing a digit auto-removes it from notes in the same row/col/box/**cage** (setting).
- Highlights: selected cell, its peers, its cage, every cell with the same digit, matching notes.
- Digit pad shows how many of each digit remain; finished digits dim.
- Killer: a cage bar lists the selected cage's combinations, striking out ones that clash with
  digits already placed in a house the cage lives in (setting). Its **Σ45 lens** works the 45 rule
  for the selected cell's row, column or box: it writes the equation and rings the innies or
  outies on the board (the calculator's Region mode).
- Queens: tap puts an ✕ on or takes it off; double-tap (second tap within ~⅓ s) makes a queen, as
  one undo step; hold clears a cell; drag paints ✕s (or erases them, if the drag starts on an ✕),
  one undo step per drag. A single tap never removes a queen (it nudges "hold to clear"), so a
  stray tap can't cost you your place. Auto-✕ (setting) shows cells ruled out by placed queens
  without storing them.
- Queens **Scratch** (tool, or S): a what-if layer. Turning it on snapshots the board; queens and
  ✕s placed after that are drawn pencilled (dashed, hatched) and count for nothing: no mistakes,
  no right/wrong feedback (that would give the answer away), no completion. Rule clashes and
  auto-✕ still show, which is the point of trying a queen. Undo stops at the snapshot; hints and
  saves read the real board. **Wipe** (or switching the tool off) restores the snapshot exactly;
  **Keep** makes the scratch real as one undo step, checked like any other move.
- Keyboard: digits, Shift/Alt+digit for notes, arrows, Backspace, N (notes), H (hint),
  Ctrl+Z / Ctrl+Shift+Z.
- Games autosave per mode; "Continue" on the home screen resumes.

### Mistakes that teach
With instant checking on (default), a wrong digit is flagged and explained when a rule makes it
provably wrong right now:
- "Row 6 already has a 5." / "Column 2 …" / "The top-left box …"
- "That cage already has a 7."
- "This 3-cell cage sums to 6, so it can only be 1+2+3 — no 9."
Otherwise: "That doesn't match the solution. Hint can show you why."
Queens: rule clashes are explained ("Queens can't touch — not even diagonally."); a queen off the
solution is flagged with a pointer to the hint.

---

## 3. Hint ladder

Every hint is one step the logical solver found from the player's **current** position, using the
player's notes as their candidate record where they exist (so elimination-only steps persist — the
"do" rung writes them into notes) and basic candidates elsewhere.

Before any step, the hint checks, in order:
1. **Wrong digits / queens** → "Something's off in the top-left box." … "Clear r3c4."
2. **Notes that exclude the answer** (or ✕s on a queen's cell) → "One of your notes rules out the
   real answer." … "Reset the notes in r6c2." (Never reveals the digit.)
3. **The easiest logical step** (tiered registry, easiest first).
4. If nothing applies (shouldn't happen with the packs): offer to reveal one cell.

| Rung | Shows | Board |
|---|---|---|
| 1 Where | which area to look at, no technique named | area tinted, rest dimmed |
| 2 What | technique name + one-line nudge, tier badge | pattern cells outlined, cages lit |
| 3 Why | full reasoning with cells, digits and arithmetic | candidates coloured by role, sight lines from justifying digits, chain arrows, dashed virtual cages |
| 4 Do | applies the step (placements, or eliminations written into notes) | normal feedback |

Hint text is generated from structured `Step.explain` data via per-technique templates (no LLM,
no prose in techniques). "Learn" on the sheet opens that technique's guide.

**Named squares.** Every `r{row}c{col}` in the visible rungs is drawn as a chip in an accent
colour, and the board rings that square in the same colour (from rung 1 on). Colours go by first
mention; squares listed together ("r1c9, r2c9 and r3c9", "r1c1 or r1c7") share one, and a square
keeps its colour wherever it comes up again. No red or green — those mean eliminate and place.
In Queens a name takes the colour of the square's region (hints name regions by colour). Tapping
a name pulses its ring. Learn examples and the Σ45 lens equation colour names the same way.
While the sheet is open the board is pinned above it, so every row stays visible, and faint row
and column numbers appear around it; the row and column of each named square light up in that
square's colour.

### Technique coverage
- **Sudoku (classic + killer):** full house, hidden/naked singles, pointing, box/line reduction,
  naked/hidden pairs–quads, X-Wing, Swordfish, Jellyfish, finned fish, Skyscraper, 2-String Kite,
  Empty Rectangle, XY-Wing, XYZ-Wing, W-Wing, Simple Colouring, Unique Rectangle, BUG+1 (classic
  only), X-Chain, XY-Chain, AIC.
- **Killer:** cage remainder, cage combinations (by sum; against candidates), cage pointing, cage
  claim, 45 rule (innies & outies over 1–4 houses, with virtual cages).
- **Queens:** last cell, region-in-line, line-in-region, touch (blocking), k-confinement,
  contradiction (short forcing chain).

---

## 4. Puzzles

- Generated offline into JSON packs (`npm run gen`), shipped with the app; deterministic per seed.
- Every pack puzzle is **solvable start to finish by the hint engine's techniques**, so a hint is
  always available.
- Grading: hardest tier needed. Classic: tier 1 easy (singles), 2 medium, 3 hard, 4–5 expert.
  Killer: ≤ tier 2 easy, single-house 45s medium, multi-house 45s / tier-3 techniques hard,
  tier 4–5 expert. Queens: tier 1–2 easy … tier 5 (contradiction) expert.
- Next puzzle = first unsolved in pack order; packs cycle when exhausted.

---

## 5. Feel (Tetris Effect direction)

- Each mode is a "stage" with its own palette: Classic *Abyss* (cyan/azure/violet), Killer *Ember*
  (magenta/orange/gold), Queens *Aurora* (mint/sky/lilac); home uses a prism mix.
- Digits 1–9 keep fixed neon hues everywhere.
- Background: slow nebula that brightens as the puzzle fills and blooms where you play.
- Placement: digit pops, sparks + shockwave in its colour, a bell note in the current chord, haptic.
- Completion: light sweeps across the house, beams and streaks, ROW / COLUMN / BOX / CAGE / ALL 7s
  callouts; simultaneous completions escalate to DOUBLE / TRIPLE / QUAD with bigger sound.
- Solve: wave of light from the last cell, fireworks, SOLVED / PERFECT, musical resolution — then
  play keeps going: ~2.4 s later the next level (next unsolved puzzle in the pack, same mode and
  difficulty) arrives on its own. A translucent results banner rides at the top meanwhile (time,
  record or previous best / first clear, mistakes, hints; PERFECT when there are none), never
  blocks input, and fades after ~6 s or on a tap. Open overlays (Learn, Scores…) pause the
  advance until they close.
- **Level entrances** — eight themed styles, rotated so every one plays once per round and never
  twice in a row, each with a matching exit for the solved board: *Warp* (rushes past you / zooms
  up out of deep space), *Rain* (squares drop in and stack from the bottom, Tetris-style),
  *Ripple* (squares well up in rings from one point), *Deal* (cards flip in diagonally), *Vortex*
  (a spiral in from the edge as the board unwinds), *Shards* (pieces fly in and lock together),
  *Hologram* (a scanline projects the board row by row), *Nova* (a flash at the centre blooms
  out). Each has its own arrival sound and a "LEVEL n · Style" callout. Cells stay live during
  them; Calm effects / reduced motion get a short fade. `?entrance=<style>` pins one (previews,
  tests).
- Mistake: shake, red sparks, muted thud, explanation toast.
- Sound: generative ambient bed per theme; every effect is quantised to the current chord.
- Settings: Calm / Vivid / Epic effects, sound, music, haptics; `prefers-reduced-motion` honoured.

---

## 6. Stats & storage

Per mode-difficulty: solved ids, best time; total solves; daily streak; per-technique hint counts
(shown on the Learn screen); a results history (last 300 levels: time, mistakes, hints, perfect,
record / first clear). **Scores** (home footer and the in-game menu) shows records per mode and
difficulty and the recent levels, filterable by mode. Levels are numbered by their place in the
pack. Everything is local (localStorage), no accounts.

---

## 7. Non-goals (for now)

Accounts, cloud sync, leaderboards, ads, purchases; variant sudokus beyond classic/killer;
camera import.

## 8. Ideas parking lot

- **Sum calculator tape** for killer — `calc.ts` exists; the manual tape UI, multi-house regions in
  the Σ45 lens, and pinned virtual cages are the next teaching features.
- Technique mastery tracking (new / learning / solid) by classifying the player's own placements.
- "Explain my mistake" replay; daily puzzle; training packs per technique.
- Beat-quantised placements (more musical, less immediate) as an option.
