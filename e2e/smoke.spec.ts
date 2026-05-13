import { expect, test } from "@playwright/test";

test("opens the root outliner screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Outliner" })).toBeVisible();
  await expect(page.getByRole("tree", { name: "Outline" })).toBeVisible();
  await expect(page.getByText("Saved locally")).toBeVisible();
});
