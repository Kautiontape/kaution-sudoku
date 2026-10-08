# Cage Coach

Sudoku, Killer Sudoku and Queens — with a coach that teaches every technique, wrapped in a
Tetris Effect–inspired light-and-sound show. Installable PWA, works offline, built for phones.

- **Three puzzles.** Classic sudoku, killer (cage sums, no givens), and the colour-region
  *Queens* puzzle (one queen per row, column and colour; queens never touch).
- **A coach, not an answer key.** Every hint is one logical step from your current position,
  revealed one rung at a time — *where* → *what* (technique) → *why* (full reasoning, drawn on the
  board) → *do*. Before any step it checks for wrong digits and for notes that rule out the real
  answer. Hints never guess: every puzzle in the packs is solvable start to finish by the same
  techniques the hints use.
- **SudokuWiki-style visuals.** Candidates coloured by role (placed, eliminated, pattern, chain
  colours), sight lines from the digits that justify a single, chain arrows, dashed 45-rule cages.
- **Squares you can find at a glance.** Every square a hint names ("r9c8") gets an accent colour
  in the text and a ring of the same colour on the board; squares listed together share one, and
  tapping a name pulses its square. In Queens a name takes its region's colour. While a hint is
  open the board sits fully above the sheet, so no ringed square hides behind it.
- **Learn screen.** Rules plus every technique the hint engine knows, grouped by tier: how to spot
  it, why it works, tips, how often hints have shown it to you, and a worked example on a real
  board drawn with the same hint visuals.
- **Killer helpers.** The cage bar lists a cage's combinations; its **Σ45 lens** works the 45 rule
  for any row, column or box ("45 − (22+10) = 13, so r4c4 + r6c5 = 13") and rings the cells.
- **Comfortable input.** Long-press a digit to pencil it; drag across cells to pencil a digit into
  all of them; auto-notes; unlimited undo; keyboard on desktop.
- **Mistakes that teach.** "Row 6 already has a 5." "That cage already has a 7." "This 3-cell cage
  sums to 6, so it can only be 1+2+3 — no 9."
- **Feel.** A slow aurora that blooms where you play; sparks in each digit's colour; light sweeping
  across completed rows, columns, boxes and cages; ROW / DOUBLE / TRIPLE callouts; a solve finale.
  Generative ambient music where every placement plays a note quantised to the current chord.
  Haptics on Android. Effects levels (Calm / Vivid / Epic) and reduced-motion support.

## Setup

```bash
npm install
npm run check        # typecheck + unit tests + build
npm run test:e2e     # Playwright, Pixel 7 viewport (set PW_CHROMIUM_PATH to reuse a local Chromium)
npm run dev          # http://localhost:5173  (?play=killer-medium jumps straight into a game)
```

### Puzzle packs

Packs live in `public/packs/{classic,killer,queens}-{easy,medium,hard,expert}.json` and are
generated offline, deterministically per seed:

```bash
npm run gen -- --mode all --count 60          # everything
npm run gen -- --mode killer --difficulty hard --count 60 --seed 1
npm run examples                              # refresh the Learn screen's worked examples
```

Classic puzzles are dug from a random grid while the exact solver confirms uniqueness, then graded
by the hardest technique the logical solver needs. Killer puzzles use a full logical solve as the
uniqueness proof: when the solver gets stuck, the loosest stuck cage is split and the solve reruns.
Queens puzzles grow colour regions around a valid queen placement and repair until unique.

## Docs

- What it does: `docs/SPEC.md`
- How it's built: `docs/ARCHITECTURE.md`
- Status and next steps: `docs/MILESTONES.md`
- Rules for Claude Code: `CLAUDE.md`
