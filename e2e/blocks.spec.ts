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

test("`> ` turns the row into a quotation", async ({ page }) => {
  await page.keyboard.type("> ");
  await expect(value(page)).toHaveValue("");
  await page.keyboard.type("someone else said this");
  await expect(page.locator(".row-quote")).toHaveCount(1);

  // And one Backspace takes it back, like every other conversion — on a fresh
  // row, since reverting a row that was already a quote restores it as one.
  await page.keyboard.press("Enter");
  await page.keyboard.type("> ");
  await expect(page.locator(".row-quote")).toHaveCount(2);
  await page.keyboard.press("Backspace");
  await expect(value(page)).toHaveValue(">");
  await expect(page.locator(".row-quote")).toHaveCount(1);
});

test("a note renders its markdown, and a fenced block becomes code", async ({ page }) => {
  await page.keyboard.type("with a note");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("plain line\n```ts\nconst x = 1;\n```\n> quoted");

  // Escape leaves the note and puts the caret back on the row; the note is
  // then rendered rather than shown as source.
  await page.keyboard.press("Escape");
  await expect(page.locator(".note-code code")).toHaveText("const x = 1;");
  await expect(page.locator(".row-note-rendered blockquote")).toHaveText("quoted");

  // Clicking the rendered note puts the source back to edit.
  await page.locator(".row-note-rendered").click();
  await expect(page.locator("textarea.row-note")).toHaveValue(/```ts/);
});
