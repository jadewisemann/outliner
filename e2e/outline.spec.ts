import { expect, test, type Page } from "@playwright/test";

/** The row textarea only exists while a row is focused, so reads go through the DOM. */
async function rowTexts(page: Page): Promise<string[]> {
  return page.$$eval(".row", (rows) =>
    rows.map((row) => {
      const editor = row.querySelector<HTMLTextAreaElement>("textarea.row-input");
      const depth = Number(getComputedStyle(row).getPropertyValue("--depth")) || 0;
      return "  ".repeat(depth) + (editor ? editor.value : (row.querySelector(".row-rendered")?.textContent ?? "").trim());
    })
  );
}

test.beforeEach(async ({ page }) => {
  // Init scripts re-run on reload, so the wipe has to happen only on first load.
  await page.addInitScript(() => {
    if (sessionStorage.getItem("wiped")) return;
    sessionStorage.setItem("wiped", "1");
    indexedDB.deleteDatabase("outliner");
  });
  await page.goto("/");
  await page.locator(".row").first().click();
});

test("types, splits and indents with the keyboard alone", async ({ page }) => {
  await page.keyboard.type("Groceries");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Milk");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Bread");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("Hardware");

  expect(await rowTexts(page)).toEqual(["Groceries", "  Milk", "  Bread", "Hardware"]);
});

test("backspace at the start joins two rows", async ({ page }) => {
  await page.keyboard.type("one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("two");
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");

  expect(await rowTexts(page)).toEqual(["onetwo"]);
});

test("survives a reload", async ({ page }) => {
  await page.keyboard.type("persist me");
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByText("persist me")).toBeVisible();
});

test("zooming narrows the outline and the breadcrumb walks back out", async ({ page }) => {
  await page.keyboard.type("Project");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Task");

  await page.locator(".row", { hasText: "Project" }).first().locator(".row-bullet").click();
  await expect(page.locator(".doc-title-zoomed h1")).toHaveText("Project");
  expect(await rowTexts(page)).toEqual(["Task"]);

  await page.locator(".breadcrumb button").first().click();
  await expect(page.locator(".doc-title-zoomed h1")).toHaveCount(0);
});

test("renders inline markup and finds rows by tag", async ({ page }) => {
  await page.keyboard.type("**bold** item #urgent");
  await page.keyboard.press("Enter");
  await page.keyboard.type("plain item");

  await expect(page.locator(".row-rendered strong")).toHaveText("bold");

  await page.keyboard.press("Control+Shift+f");
  await page.locator(".search-input").fill("#urgent");
  await expect(page.locator(".search-hit")).toHaveCount(1);
  await page.locator(".search-hit").first().click();
  await expect(page.locator("textarea.row-input")).toHaveValue("**bold** item #urgent");
});

test("reads @ as a tag as well, and leaves an address alone", async ({ page }) => {
  await page.keyboard.type("ping @waiting");
  await page.keyboard.press("Enter");
  await page.keyboard.type("mail jade@example.com");
  // Leave the row so both lines are rendered rather than shown as source.
  await page.keyboard.press("Escape");

  // Painted as a tag on one line, plain text on the other.
  await expect(page.locator(".inline-tag")).toHaveText("@waiting");

  await page.keyboard.press("Control+Shift+f");
  await page.locator(".search-input").fill("@waiting");
  await expect(page.locator(".search-hit")).toHaveCount(1);
});

test("moving a row down leaves its parent instead of stopping", async ({ page }) => {
  await page.keyboard.type("Project");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Task");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("Other");

  await page.locator(".row", { hasText: "Task" }).first().click();
  await page.keyboard.press("Control+Shift+ArrowDown");
  expect(await rowTexts(page)).toEqual(["Project", "Other", "Task"]);

  // The last row of the outline is still a wall.
  await page.keyboard.press("Control+Shift+ArrowDown");
  expect(await rowTexts(page)).toEqual(["Project", "Other", "Task"]);
});

test("a zoomed outline is the wall a vertical move stops at", async ({ page }) => {
  await page.keyboard.type("Project");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Task");

  await page.locator(".row", { hasText: "Project" }).first().locator(".row-bullet").click();
  expect(await rowTexts(page)).toEqual(["Task"]);

  // Without the zoom root the step would carry Task above Project, out of sight.
  await page.locator(".row", { hasText: "Task" }).first().click();
  await page.keyboard.press("Control+Shift+ArrowUp");
  expect(await rowTexts(page)).toEqual(["Task"]);
});

test("⌘A widens the selection one step at a time", async ({ page }) => {
  await page.keyboard.type("head");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("two");

  // The caret sits in "two", so the first press is the browser taking the text.
  await page.keyboard.press("Control+a");
  await expect(page.locator(".row-selected")).toHaveCount(0);

  await page.keyboard.press("Control+a");
  await expect(page.locator(".row-selected")).toHaveCount(1);

  await page.keyboard.press("Control+a");
  await expect(page.locator(".row-selected")).toHaveCount(2);

  await page.keyboard.press("Control+a");
  await expect(page.locator(".row-selected")).toHaveCount(3);

  // The whole outline is the last step, and pressing again holds there.
  await page.keyboard.press("Control+a");
  await expect(page.locator(".row-selected")).toHaveCount(3);
});

test("selects rows with Escape and moves them together", async ({ page }) => {
  await page.keyboard.type("head");
  await page.keyboard.press("Enter");
  await page.keyboard.type("a");
  await page.keyboard.press("Enter");
  await page.keyboard.type("b");

  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(page.locator(".row-selected")).toHaveCount(2);

  await page.keyboard.press("Tab");
  expect(await rowTexts(page)).toEqual(["head", "  a", "  b"]);

  await page.keyboard.press("Backspace");
  expect(await rowTexts(page)).toEqual(["head"]);
});

test("pasted indented text becomes a subtree", async ({ page }) => {
  await page.evaluate(() => navigator.clipboard.writeText("- one\n  - one-a\n- two"));
  await page.keyboard.press("Control+v");
  expect(await rowTexts(page)).toEqual(["one", "  one-a", "two"]);
});

test("keeps an IME composition intact and does not split on the commit key", async ({ page }) => {
  // Replays the event sequence a Korean IME produces for 한 + 글, where the
  // final Enter commits the syllable instead of acting as a shortcut.
  await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("textarea.row-input")!;
    const compose = (value: string, data: string, type: "compositionstart" | "compositionupdate") => {
      area.dispatchEvent(new CompositionEvent(type, { bubbles: true, data }));
      area.value = value;
      area.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true, data }));
    };
    compose("ㅎ", "ㅎ", "compositionstart");
    compose("하", "하", "compositionupdate");
    compose("한", "한", "compositionupdate");
    compose("한그", "한그", "compositionupdate");
    compose("한글", "한글", "compositionupdate");

    area.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true }));
    area.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "한글" }));
    area.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });

  await expect(page.locator("textarea.row-input")).toHaveValue("한글");
  expect(await rowTexts(page)).toEqual(["한글"]);

  await page.keyboard.type(" 아웃라이너");
  await expect(page.locator("textarea.row-input")).toHaveValue("한글 아웃라이너");
});

test("dragging a bullet moves the row under another", async ({ page }) => {
  await page.keyboard.type("target");
  await page.keyboard.press("Enter");
  await page.keyboard.type("dragged");

  const source = page.locator(".row", { hasText: "dragged" }).locator(".row-bullet");
  await source.dragTo(page.locator(".row", { hasText: "target" }), { targetPosition: { x: 200, y: 16 } });

  expect(await rowTexts(page)).toEqual(["target", "  dragged"]);
});

test("undo reverses a structural change", async ({ page }) => {
  await page.keyboard.type("first");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  expect(await rowTexts(page)).toEqual(["first"]);
});
