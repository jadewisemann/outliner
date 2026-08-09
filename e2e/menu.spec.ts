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

test("right-clicking a bullet opens the item menu and applies what it offers", async ({ page }) => {
  await page.keyboard.type("a row");
  await page.keyboard.press("Enter");
  await page.keyboard.type("another");

  await page.locator(".row").first().locator(".row-marker").click({ button: "right" });
  await expect(page.locator(".row-menu")).toBeVisible();

  await page.locator('[aria-label="색 4"]').click();
  await expect(page.locator(".row-c4")).toHaveCount(1);
  await expect(page.locator(".row-menu")).toHaveCount(0);

  // The list flags act on the parent, so both siblings get a checkbox.
  await page.locator(".row").first().locator(".row-marker").click({ button: "right" });
  await page.getByRole("menuitem", { name: "체크리스트로" }).click();
  await expect(page.locator(".row-check")).toHaveCount(2);

  await page.locator(".row").first().locator(".row-marker").click({ button: "right" });
  await page.getByRole("menuitem", { name: "인용으로" }).click();
  await expect(page.locator(".row-quote")).toHaveCount(1);
});

test("Escape closes the menu without doing anything", async ({ page }) => {
  await page.keyboard.type("untouched");
  await page.locator(".row-marker").first().click({ button: "right" });
  await expect(page.locator(".row-menu")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator(".row-menu")).toHaveCount(0);
  await expect(page.getByText("untouched")).toBeVisible();
});

test("copies a link to the row that the outline can follow", async ({ page }) => {
  await page.keyboard.type("link me");
  await page.locator(".row-marker").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "항목 링크 복사" }).click();

  await page.locator(".outline-tail").click();
  await page.keyboard.press("Control+v");
  await expect(page.locator("textarea.row-input")).toHaveValue(/^\(\([\w-]+\)\)$/);
});
