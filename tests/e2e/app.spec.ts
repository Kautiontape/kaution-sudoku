import { expect, test } from "@playwright/test";
import { applyNextHint, cellLocator, digitKey, readBoard, solveWithHints } from "./helpers";

test("home shows the three modes and starts a game", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Cage Coach" })).toBeVisible();
  for (const m of ["classic", "killer", "queens"]) await expect(page.getByTestId(`mode-${m}`)).toBeVisible();
  await page.getByTestId("mode-classic").locator(".mode-head").click();
  await page.getByTestId("play-classic-easy").click();
  await expect(page.getByRole("gridcell")).toHaveCount(81);
  await page.screenshot({ path: "test-results/screens/classic.png" });
});

test("classic: placing, a teaching mistake, and undo", async ({ page }) => {
  await page.goto("/?play=classic-easy");
  await expect(page.getByRole("gridcell")).toHaveCount(81);
  const board = await readBoard(page);
  // Find an empty cell and a digit already given in its row: placing it must be explained.
  const target = board.find((x) => !x.value && board.some((y) => y.r === x.r && y.value));
  expect(target).toBeDefined();
  const clash = board.find((y) => y.r === target!.r && y.value)!;
  await cellLocator(page, target!.cell).click();
  await digitKey(page, Number(clash.value)).click();
  await expect(page.getByTestId("toast")).toContainText(`Row ${target!.r + 1} already has a ${clash.value}.`);
  await expect(cellLocator(page, target!.cell)).toHaveClass(/wrong/);
  await expect(page.locator(".stats")).toContainText("Mistakes 1");
  await page.getByTestId("tool-undo").click();
  await expect(cellLocator(page, target!.cell).locator(".v")).toHaveText("");
});

test("classic: notes mode pencils candidates; long-press does too", async ({ page }) => {
  await page.goto("/?play=classic-easy");
  const empty = (await readBoard(page)).find((x) => !x.value)!;
  await cellLocator(page, empty.cell).click();
  await page.getByTestId("tool-notes").click();
  await digitKey(page, 3).click();
  await expect(cellLocator(page, empty.cell).locator(".notes i.on")).toHaveCount(1);
  await page.getByTestId("tool-notes").click();
  await digitKey(page, 5).click({ delay: 600 }); // long press
  await expect(cellLocator(page, empty.cell).locator(".notes i.on")).toHaveCount(2);
});

test("hint ladder climbs where → what → why and applies a step", async ({ page }) => {
  await page.goto("/?play=classic-easy");
  await page.getByTestId("tool-hint").click();
  const sheet = page.getByTestId("hint-sheet");
  await expect(sheet.locator(".rung-1")).toContainText("Look at");
  await expect(sheet.locator(".hs-title")).toHaveText("Hint"); // technique hidden on rung 1
  await page.getByTestId("hint-next").click();
  await expect(sheet.locator(".hs-title")).not.toHaveText("Hint");
  await page.getByTestId("hint-next").click();
  await expect(page.locator(".board.hinting")).toHaveCount(1);
  await page.screenshot({ path: "test-results/screens/hint-why.png" });
  await page.getByTestId("hint-next").click();
  await expect(page.locator(".stats")).toContainText("Hints 1");
});

test("classic easy can be solved entirely by following hints", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/?play=classic-easy");
  await solveWithHints(page);
  await expect(page.getByTestId("win")).toContainText("Solved");
  await page.screenshot({ path: "test-results/screens/win.png" });
  await page.getByTestId("next-puzzle").click();
  await expect(page.getByRole("gridcell")).toHaveCount(81);
});

test("killer: cages render and a cage repeat is explained", async ({ page }) => {
  await page.goto("/?play=killer-easy");
  await expect(page.locator(".sum").first()).toBeVisible();
  const board = await readBoard(page);
  // Two cells in one cage that share no row, column or box.
  let pair: [number, number] | null = null;
  for (const a of board)
    for (const b of board)
      if (a.cell < b.cell && a.cage && a.cage === b.cage && a.r !== b.r && a.c !== b.c && a.b !== b.b) pair ??= [a.cell, b.cell];
  test.skip(!pair, "no diagonal cage pair in this puzzle");
  await cellLocator(page, pair![0]).click();
  await digitKey(page, 5).click();
  await cellLocator(page, pair![1]).click();
  await digitKey(page, 5).click();
  await expect(page.getByTestId("toast")).toContainText("cage already has a 5");
  await page.screenshot({ path: "test-results/screens/killer.png" });
});

test("killer: the 45 lens works out a house's innies or outies", async ({ page }) => {
  await page.goto("/?play=killer-medium");
  await page.locator(".board .cell").nth(40).click();
  await page.getByTestId("lens").click();
  await expect(page.getByTestId("lens-eq")).toContainText(/45|cage fits|poke out/);
  await expect(page.locator(".cell.lens-region")).toHaveCount(9);
  await page.getByRole("button", { name: "Box 5" }).click();
  await expect(page.locator(".cell.lens-region")).toHaveCount(9);
  const text = await page.getByTestId("lens-eq").innerText();
  // A readable equation names its cells and rings them on the board.
  if (/so r\dc\d/.test(text)) expect(await page.locator(".cell.lens-in, .cell.lens-out").count()).toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/screens/killer-lens.png" });
  await page.getByTestId("lens").click(); // close
  await expect(page.locator(".cell.lens-region")).toHaveCount(0);
});

test("killer: the first hints teach cage combinations", async ({ page }) => {
  await page.goto("/?play=killer-easy");
  const why = await applyNextHint(page);
  expect(why.length).toBeGreaterThan(10);
});

test("queens: tap cycles ✕ → queen, conflicts are explained, hints solve it", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/?play=queens-easy");
  const cells = page.locator(".qcell");
  const n = Math.round(Math.sqrt(await cells.count()));
  expect(n).toBeGreaterThanOrEqual(5);
  await cells.nth(0).click();
  await expect(cells.nth(0)).toHaveClass(/cross/);
  await cells.nth(0).click();
  await expect(cells.nth(0)).toHaveClass(/queen/);
  // A second queen in the same row clashes.
  await cells.nth(2).click();
  await cells.nth(2).click();
  await expect(page.getByTestId("toast")).toContainText("row");
  await page.getByTestId("tool-clear").click();
  await expect(page.locator(".qcell.queen")).toHaveCount(0);
  await page.screenshot({ path: "test-results/screens/queens.png" });
  await solveWithHints(page, 120);
  await expect(page.locator(".qcell.queen")).toHaveCount(n);
});

test("learn and settings overlays open and close", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("open-learn").click();
  const learn = page.getByTestId("learn");
  await expect(learn).toBeVisible();
  await learn.getByRole("tab", { name: "Killer" }).click();
  await expect(learn).toContainText("45 Rule");
  await learn.getByRole("tab", { name: "Queens" }).click();
  await expect(learn).toContainText("How to play");
  await page.keyboard.press("Escape");
  await expect(learn).toHaveCount(0);
  await page.getByTestId("open-settings").click();
  const sw = page.getByTestId("settings").locator('input[data-key="haptics"]');
  await sw.uncheck({ force: true });
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByTestId("open-settings").click();
  await expect(page.getByTestId("settings").locator('input[data-key="haptics"]')).not.toBeChecked();
});

test("learn cards show a worked example on a real board", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("open-learn").click();
  const card = page.locator("#tech-hidden-single");
  await card.locator("summary").click();
  await card.getByTestId("example-hidden-single").click();
  await expect(card.locator(".example .board .cell")).toHaveCount(81);
  await expect(card.locator(".example-do")).toContainText("Place");
  await page.getByRole("tab", { name: "Queens" }).click();
  const q = page.locator("#tech-last-cell");
  await q.locator("summary").click();
  await q.getByTestId("example-last-cell").click();
  await expect(q.locator(".example .qcell").first()).toBeVisible();
});

test("progress resumes after reload", async ({ page }) => {
  await page.goto("/?play=classic-easy");
  await applyNextHint(page);
  await page.goto("/");
  await expect(page.getByTestId("resume-classic")).toBeVisible();
  await page.getByTestId("resume-classic").click();
  await expect(page.locator(".stats")).toContainText("Hints 1");
});
