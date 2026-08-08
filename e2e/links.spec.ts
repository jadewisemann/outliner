import { expect, test, type Page } from "@playwright/test";

const value = (page: Page) => page.locator("textarea.row-input");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("wiped")) return;
    sessionStorage.setItem("wiped", "1");
    indexedDB.deleteDatabase("outliner");
  });
  await page.goto("/");
  await page.locator(".row").first().click();
});

test("links to a row, renders the target's text, and follows it", async ({ page }) => {
  await page.keyboard.type("the target row");
  await page.keyboard.press("Enter");
  await page.keyboard.type("see [[target");

  // `[[` offers rows as well as documents.
  await expect(page.locator(".row-complete button")).toContainText(["the target row"]);
  await page.keyboard.press("Enter");

  // The source holds an id, but reads as the target's own words.
  await expect(value(page)).toHaveValue(/^see \(\([\w-]+\)\)$/);
  await page.locator(".outline-tail").click();
  await expect(page.locator(".inline-itemlink")).toHaveText("the target row");

  // Renaming the target renames every link to it.
  await page.locator(".row").first().click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("renamed target");
  await page.locator(".outline-tail").click();
  await expect(page.locator(".inline-itemlink")).toHaveText("renamed target");

  await page.locator(".inline-itemlink").click();
  await expect(value(page)).toHaveValue("renamed target");
});

test("shows what points at the row being read", async ({ page }) => {
  await page.keyboard.type("the target row");
  await page.keyboard.press("Enter");
  await page.keyboard.type("a source [[target");
  await page.keyboard.press("Enter");

  // Zoom into the target: the source should show up underneath.
  await page.locator(".row").first().locator(".row-bullet").click();
  await expect(page.locator(".backlinks")).toBeVisible();
  await expect(page.locator(".backlink-text")).toContainText("a source");

  await page.locator(".backlinks button").click();
  await expect(value(page)).toContainText("a source");
});

test("a link whose target is deleted says so instead of vanishing", async ({ page }) => {
  await page.keyboard.type("doomed");
  await page.keyboard.press("Enter");
  await page.keyboard.type("points at [[doomed");
  await page.keyboard.press("Enter");

  await page.locator(".row").first().click();
  await page.keyboard.press("Control+Shift+k");
  await page.locator(".outline-tail").click();

  await expect(page.locator(".inline-itemlink-broken")).toHaveText("(없는 항목)");
});

test("moves a row with its children to another document, keeping links to it", async ({ page }) => {
  await page.keyboard.type("keeper");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("a child");
  await page.keyboard.press("ArrowUp");

  // A second document to move into.
  await page.locator('[title="새 문서"]').click();
  await page.locator(".doc-item-active .doc-open").dblclick();
  await page.locator(".doc-rename").fill("Archive");
  await page.keyboard.press("Enter");

  // Back to the first, link to the row, then move it away.
  await page.locator(".doc-item").first().locator(".doc-open").click();
  await page.locator(".row").first().click();
  await page.keyboard.press("Control+p");
  await page.locator(".search-input").fill(">다른 문서로 이동");
  await page.keyboard.press("Enter");
  await page.locator(".search-input").fill(">>Archive");
  await page.keyboard.press("Enter");

  // Gone from here, and in Archive with its child.
  await expect(page.getByText("keeper")).toHaveCount(0);
  await page.locator(".doc-item", { hasText: "Archive" }).locator(".doc-open").click();
  await expect(page.locator(".row")).toHaveCount(3);
  await expect(page.getByText("a child")).toBeVisible();
});
