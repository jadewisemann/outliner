import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("wiped")) return;
    sessionStorage.setItem("wiped", "1");
    indexedDB.deleteDatabase("outliner");
  });
  await page.goto("/");
  await page.locator(".row").first().click();
});

test("a deleted document goes to the trash and comes back from it", async ({ page }) => {
  await page.keyboard.type("in the first doc");
  await page.locator('[title="새 문서"]').click();
  await page.locator(".doc-item-active .doc-open").dblclick();
  await page.locator(".doc-rename").fill("Doomed");
  await page.keyboard.press("Enter");
  await page.locator(".row").first().click();
  await page.keyboard.type("worth keeping after all");

  page.on("dialog", (dialog) => dialog.accept());
  await page.locator(".doc-item", { hasText: "Doomed" }).hover();
  await page.locator(".doc-item", { hasText: "Doomed" }).locator(".doc-remove").click();

  await expect(page.locator(".doc-item", { hasText: "Doomed" })).toHaveCount(0);
  await page.getByRole("button", { name: /휴지통/ }).click();
  await expect(page.locator(".doc-item-trashed")).toHaveCount(1);

  await page.locator('[title="되살리기"]').click();
  await expect(page.locator(".doc-item", { hasText: "Doomed" })).toHaveCount(1);
  await page.locator(".doc-item", { hasText: "Doomed" }).locator(".doc-open").click();
  await expect(page.getByText("worth keeping after all")).toBeVisible();
});

test("a saved search lives in the sidebar and runs from it", async ({ page }) => {
  await page.keyboard.type("buy milk #errand");
  await page.keyboard.press("Enter");
  await page.keyboard.type("write the report");

  page.on("dialog", (dialog) => dialog.accept("Errands"));
  await page.keyboard.press("Control+Shift+f");
  await page.locator(".search-input").fill("#errand");
  await page.locator(".search-save").click();

  const saved = page.locator(".doc-item", { hasText: "Errands" });
  await expect(saved).toHaveCount(1);
  await saved.locator(".doc-open").click();
  await expect(page.locator(".search-hit")).toHaveCount(1);
  await expect(page.locator(".search-hit").first()).toContainText("buy milk");
});
