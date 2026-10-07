# Cage Coach

Killer sudoku that teaches: a 4-rung hint ladder, an on-board sum calculator, a notes audit, and puzzles graded by the techniques they actually require.

- What it does: `docs/SPEC.md`
- How it's built: `docs/ARCHITECTURE.md`
- Build order: `docs/MILESTONES.md`
- Rules for Claude Code: `CLAUDE.md`

## Setup

```bash
npm install
npx playwright install chromium
npm run check        # typecheck + unit tests + build
npm run test:e2e     # mobile-viewport browser tests
npm run dev          # http://localhost:5173
```

## Kicking off with Claude Code

From the repo root:

```
claude
```

Then:

> Read CLAUDE.md and the docs. Implement milestone M1 test-first. Stop when `npm run check` is green and the milestone is ticked, and summarize what you deferred.

Repeat per milestone. M3 and M4 are UI-heavy; ask for Playwright tests on the mobile viewport and screenshots in `test-results/` to review on your phone.

## Status

M0 done: tooling, cage-combo tables, calculator tape engine (incl. symbolic 45-rule equations), puzzle/solution validation, placeholder board, 22 unit tests + 1 e2e test.
