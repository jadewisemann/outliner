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

test("renders $$math$$, and shows the source until the renderer arrives", async ({ page }) => {
  await page.keyboard.type("area is $$\\int_0^1 x^2 dx$$ exactly");
  await page.locator(".outline-tail").click();

  // KaTeX is fetched on demand, so the source stands in until it lands.
  await expect(page.locator(".math .katex")).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator(".row-rendered").first()).toContainText("area is");
});

test("code blocks are coloured without a highlighting library", async ({ page }) => {
  await page.keyboard.type("code");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type('```js\nconst n = 42; // note\n```');
  await page.keyboard.press("Escape");

  await expect(page.locator(".tok-keyword")).toHaveText(["const"]);
  await expect(page.locator(".tok-number")).toHaveText(["42"]);
  await expect(page.locator(".tok-comment")).toHaveText(["// note"]);
});
