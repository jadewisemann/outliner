import { expect, test, type Page } from "@playwright/test";

/** The row textarea only exists while a row is focused, so reads go through the DOM. */
async function rowTexts(page: Page): Promise<string[]> {
  return page.$$eval(".row", (rows) =>
    rows.map((row) => {
      const editor = row.querySelector<HTMLTextAreaElement>("textarea.row-input");
      return editor ? editor.value : (row.querySelector(".row-rendered")?.textContent ?? "").trim();
    })
  );
}

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

test("wraps the selection with formatting shortcuts and unwraps on a second press", async ({ page }) => {
  await page.keyboard.type("make this bold");
  // Select "bold".
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");

  await page.keyboard.press("Control+b");
  await expect(value(page)).toHaveValue("make this **bold**");

  await page.keyboard.press("Control+b");
  await expect(value(page)).toHaveValue("make this bold");
});

test("keeps the selection so a second shortcut stacks on the first", async ({ page }) => {
  await page.keyboard.type("word");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+b");
  await page.keyboard.press("Control+i");
  await expect(value(page)).toHaveValue("***word***");
});

test("⌘K links the selection and puts the caret in the parentheses", async ({ page }) => {
  await page.keyboard.type("docs");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("https://x.dev");
  await expect(value(page)).toHaveValue("[docs](https://x.dev)");
});

test("turns a markdown prefix into a heading", async ({ page }) => {
  await page.keyboard.type("## ");
  await expect(value(page)).toHaveValue("");
  await page.keyboard.type("Chapter");
  await expect(page.locator(".row-h2")).toHaveCount(1);
});

test("one backspace undoes the conversion, as long as it is the next key", async ({ page }) => {
  await page.keyboard.type("### ");
  await expect(page.locator(".row-h3")).toHaveCount(1);

  await page.keyboard.press("Backspace");
  await expect(value(page)).toHaveValue("###");
  await expect(page.locator(".row-h3")).toHaveCount(0);

  // Typing first means the conversion was accepted; Backspace is then a
  // Backspace again, and at offset 0 that still merges into the row above.
  await page.keyboard.press("Control+a");
  await page.keyboard.type("# ");
  await page.keyboard.type("Chapter");
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await expect(value(page)).toHaveValue("Chapter");
  await expect(page.locator(".row-h1")).toHaveCount(1);
});

test("a checkbox prefix makes the whole list a checklist", async ({ page }) => {
  await page.keyboard.type("shopping");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.locator(".row-check")).toHaveCount(0);

  await page.keyboard.type("[] milk");
  await page.keyboard.press("Enter");
  await page.keyboard.type("bread");

  // The flag is the parent's, so the sibling typed afterwards has one too.
  await expect(page.locator(".row-check")).toHaveCount(2);
  expect(await rowTexts(page)).toEqual(["shopping", "milk", "bread"]);
});

test("a numbered prefix numbers the list", async ({ page }) => {
  await page.keyboard.type("steps");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("1. first");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second");

  await expect(page.locator(".row-number")).toHaveText(["1.", "2."]);
});

test("duplicates a row with its children, and deletes one", async ({ page }) => {
  await page.keyboard.type("parent");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("child");
  await page.keyboard.press("ArrowUp");

  await page.keyboard.press("Control+d");
  expect(await rowTexts(page)).toEqual(["parent", "child", "parent", "child"]);

  await page.keyboard.press("Control+Shift+k");
  expect(await rowTexts(page)).toEqual(["parent", "child"]);
});

test("completes a document name after [[", async ({ page }) => {
  await page.locator('[title="새 문서"]').click();
  // Rename the fresh document so there is something distinctive to complete.
  await page.locator(".doc-item-active .doc-open").dblclick();
  await page.locator(".doc-rename").fill("Reading list");
  await page.keyboard.press("Enter");

  await page.locator(".row").first().click();
  await page.keyboard.type("see [[read");
  await expect(page.locator(".row-complete button")).toHaveCount(1);

  await page.keyboard.press("Enter");
  await expect(value(page)).toHaveValue("see [[Reading list]]");
});

test("completes a tag that is already used elsewhere", async ({ page }) => {
  await page.keyboard.type("first #urgent");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second #ur");

  await expect(page.locator(".row-complete button")).toHaveText(["#urgent"]);
  await page.keyboard.press("Tab");
  await expect(value(page)).toHaveValue("second #urgent");
});

test("the palette runs a command that no menu has to be opened for", async ({ page }) => {
  await page.keyboard.type("a row");

  await page.keyboard.press("Control+Shift+p");
  await page.locator(".search-input").fill(">제목 2");
  await page.keyboard.press("Enter");
  await expect(page.locator(".row-h2")).toHaveCount(1);

  await page.keyboard.press("Control+Shift+p");
  await page.locator(".search-input").fill(">체크리스트");
  await page.keyboard.press("Enter");
  await expect(page.locator(".row-check")).toHaveCount(1);
});

test("the palette jumps to a document and to an item", async ({ page }) => {
  await page.keyboard.type("needle in the first doc");
  await page.locator('[title="새 문서"]').click();
  await page.locator(".doc-item-active .doc-open").dblclick();
  await page.locator(".doc-rename").fill("Second");
  await page.keyboard.press("Enter");

  await page.keyboard.press("Control+p");
  await page.locator(".search-input").fill("needle");
  await expect(page.locator(".palette-hit").first()).toContainText("needle");
  await page.keyboard.press("Enter");
  await expect(page.locator("textarea.row-input")).toHaveValue("needle in the first doc");

  // Empty query offers where you have just been.
  await page.keyboard.press("Control+p");
  await expect(page.locator(".palette-hit").first()).toContainText("최근");
});

test("⌘F filters the document in place and the rows stay editable", async ({ page }) => {
  await page.keyboard.type("Groceries");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("milk");
  await page.keyboard.press("Enter");
  await page.keyboard.type("bread");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("Hardware");

  await page.keyboard.press("Control+f");
  await page.locator(".filter-input").fill("milk");

  // The match keeps the ancestor that places it; the unrelated branch goes.
  expect(await rowTexts(page)).toEqual(["Groceries", "milk"]);

  await page.locator(".row").last().click();
  await page.keyboard.type(" 2L");
  await expect(value(page)).toHaveValue("milk 2L");

  await page.locator(".filter-input").click();
  await page.keyboard.press("Escape");
  expect(await rowTexts(page)).toEqual(["Groceries", "milk 2L", "bread", "Hardware"]);
});

test("filters with an operator, not just words", async ({ page }) => {
  await page.keyboard.type("shopping");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("[] milk");
  await page.keyboard.press("Enter");
  await page.keyboard.type("bread");
  await page.keyboard.press("Control+Enter");

  await page.keyboard.press("Control+f");
  await page.locator(".filter-input").fill("is:incomplete");
  expect(await rowTexts(page)).toEqual(["shopping", "milk"]);

  await page.locator(".filter-input").fill("is:completed");
  expect(await rowTexts(page)).toEqual(["shopping", "bread"]);
});
