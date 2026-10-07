import { expect, test } from "@playwright/test";

test("renders an 81-cell board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Cage Coach" })).toBeVisible();
  await expect(page.getByRole("gridcell")).toHaveCount(81);
});
