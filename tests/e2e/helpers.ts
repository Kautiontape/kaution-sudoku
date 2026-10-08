import { expect, type Page } from "@playwright/test";

/** Open the hint sheet and climb to "Apply it" (rung 3 → apply). Returns the "do" text shown. */
export async function applyNextHint(page: Page): Promise<string> {
  await page.getByTestId("tool-hint").click();
  const sheet = page.getByTestId("hint-sheet");
  await expect(sheet).toHaveClass(/open/);
  await page.getByTestId("hint-next").click(); // → what
  await page.getByTestId("hint-next").click(); // → why
  const why = await sheet.locator(".rung-3").innerText();
  await page.getByTestId("hint-next").click(); // → do + apply
  await expect(sheet).not.toHaveClass(/open/);
  return why;
}

/** Keep applying hints until the win card shows (or the cap is hit). Returns hints used. */
export async function solveWithHints(page: Page, cap = 400): Promise<number> {
  const win = page.getByTestId("win");
  for (let i = 0; i < cap; i++) {
    if (await win.isVisible()) return i;
    // The finale plays before the card appears; once the board is solved, just wait for it.
    if (await page.locator('.play[data-solved="true"]').count()) break;
    await applyNextHint(page);
  }
  await expect(win).toBeVisible({ timeout: 8000 });
  return cap;
}

export interface CellInfo {
  cell: number;
  r: number;
  c: number;
  b: number;
  value: string;
  cage?: string;
}

export async function readBoard(page: Page): Promise<CellInfo[]> {
  return page.$$eval(".board .cell", (els) =>
    els.map((el) => {
      const d = (el as HTMLElement).dataset;
      return {
        cell: Number(d.cell),
        r: Number(d.r),
        c: Number(d.c),
        b: Number(d.b),
        value: el.querySelector(".v")?.textContent ?? "",
        cage: d.cage,
      };
    }),
  );
}

export const cellLocator = (page: Page, cell: number) => page.locator(`.board .cell[data-cell="${cell}"]`);
export const digitKey = (page: Page, d: number) => page.locator(`.numpad .num[data-digit="${d}"]`);
