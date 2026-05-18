import { expect, test } from "@playwright/test";

test("pastes an indented outline as multiple nodes", async ({ page }) => {
  await openFreshPage(page);
  await pastePlainText(page, "A\n  B\nC");

  await expect(outlineText(page, "A")).toBeVisible();
  await expect(outlineText(page, "B")).toBeVisible();
  await expect(outlineText(page, "C")).toBeVisible();

  await page.getByRole("button", { name: "Collapse node" }).first().click();
  await expect(outlineText(page, "B")).toBeHidden();
  await expect(outlineText(page, "C")).toBeVisible();
});

test("bulk indents and deletes a selected visible range", async ({ page }) => {
  await openFreshPage(page);
  await pastePlainText(page, "A\nB\nC\nD");
  await expect(outlineText(page, "A")).toBeVisible();
  await expect(outlineText(page, "B")).toBeVisible();
  await expect(outlineText(page, "C")).toBeVisible();
  await expect(outlineText(page, "D")).toBeVisible();

  await selectRangeFromFocusedRow(page, "B", 1);
  await pressEditorKey(page, { key: "Tab", code: "Tab" });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Collapse node" }).first().click();
  await expect(outlineText(page, "B")).toBeHidden();
  await expect(outlineText(page, "C")).toBeHidden();
  await expect(outlineText(page, "D")).toBeVisible();
  await page.getByRole("button", { name: "Expand node" }).first().click();

  await selectRangeFromFocusedRow(page, "B", 1);
  await pressEditorKey(page, { key: "Backspace", code: "Backspace" });

  await expect(outlineText(page, "A")).toBeVisible();
  await expect(outlineText(page, "B")).toBeHidden();
  await expect(outlineText(page, "C")).toBeHidden();
  await expect(outlineText(page, "D")).toBeVisible();
});

test("moves nodes and selected ranges with alt arrow shortcuts", async ({ page }) => {
  await openFreshPage(page);
  await pastePlainText(page, "A\nB\nC\nD");
  await focusRow(page, "B");
  await page.keyboard.press("Alt+ArrowUp");

  await expectRowOrder(page, ["B", "A", "C", "D"]);

  await selectRangeFromFocusedRow(page, "C", 1);
  await page.keyboard.press("Alt+ArrowUp");

  await expectRowOrder(page, ["B", "C", "D", "A"]);
});

test("moves a root node above a parent block without changing depth", async ({ page }) => {
  await openFreshPage(page);
  await pastePlainText(page, "a\n  a.a\nb");
  await focusRow(page, "b");
  await page.keyboard.press("Alt+ArrowUp");

  await expectRowOrder(page, ["b", "a", "a.a"]);
  await expect(page.locator(".outline-row").nth(0)).toHaveCSS("padding-left", "0px");
  await expect(page.locator(".outline-row").nth(2)).toHaveCSS("padding-left", "24px");
});

test("moves first and last children across parent boundaries", async ({ page }) => {
  await openFreshPage(page);
  await pastePlainText(page, "a\n  a.a\nb\n  b.a");
  await focusRow(page, "b.a");
  await page.keyboard.press("Alt+ArrowUp");
  await expectRowOrder(page, ["a", "a.a", "b.a", "b"]);
  await expect(page.locator(".outline-row").nth(2)).toHaveCSS("padding-left", "24px");

  await openFreshPage(page);
  await pastePlainText(page, "a\n  a.a\nb\n  b.a");
  await focusRow(page, "a.a");
  await page.keyboard.press("Alt+ArrowUp");
  await expectRowOrder(page, ["a.a", "a", "b", "b.a"]);
  await expect(page.locator(".outline-row").nth(0)).toHaveCSS("padding-left", "0px");

  await openFreshPage(page);
  await pastePlainText(page, "a\n  a.a\nb\n  b.a");
  await focusRow(page, "a.a");
  await page.keyboard.press("Alt+ArrowDown");
  await expectRowOrder(page, ["a", "b", "a.a", "b.a"]);
  await expect(page.locator(".outline-row").nth(2)).toHaveCSS("padding-left", "24px");

  await openFreshPage(page);
  await pastePlainText(page, "a\n  a.a\nb\n  b.a");
  await focusRow(page, "b.a");
  await page.keyboard.press("Alt+ArrowDown");
  await expectRowOrder(page, ["a", "a.a", "b", "b.a"]);
  await expect(page.locator(".outline-row").nth(3)).toHaveCSS("padding-left", "0px");
});

test("edits multiple rows with keyboard multi cursors", async ({ page }) => {
  await openFreshPage(page);
  await pastePlainText(page, "A\nB");
  await focusRow(page, "A");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+ArrowDown" : "Control+Alt+ArrowDown");
  await expect(page.locator(".outline-row-cursor")).toHaveCount(2);

  await page.keyboard.press("x");
  await expect(outlineText(page, "Ax")).toBeVisible();
  await expect(outlineText(page, "Bx")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator(".outline-row-cursor")).toHaveCount(0);
});

async function selectRangeFromFocusedRow(page: import("@playwright/test").Page, firstText: string, arrowDownCount: number) {
  await focusRow(page, firstText);
  await expect(page.getByRole("textbox", { name: "Outline node text" })).toBeFocused();
  await page.keyboard.down("Shift");
  for (let index = 0; index < arrowDownCount; index += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.up("Shift");
  await expect(page.locator(".outline-row-selected")).toHaveCount(arrowDownCount + 1);
  const selectedTexts = await page
    .locator(".outline-row-selected")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-node-text")));
  const focusedText = selectedTexts[arrowDownCount];
  if (focusedText) {
    await expect(page.locator(".outline-row-active")).toHaveAttribute("data-node-text", focusedText);
    await expect(page.getByRole("textbox", { name: "Outline node text" })).toContainText(focusedText);
  }
  await expect(page.getByRole("textbox", { name: "Outline node text" })).toBeFocused();
}

async function focusRow(page: import("@playwright/test").Page, text: string) {
  await outlineText(page, text).click();
  const textbox = page.getByRole("textbox", { name: "Outline node text" });
  await expect(textbox).toContainText(text);
  await expect(textbox).toBeFocused();
}

async function pressEditorKey(
  page: import("@playwright/test").Page,
  init: Pick<KeyboardEventInit, "key" | "code" | "altKey" | "metaKey" | "ctrlKey" | "shiftKey">
) {
  await page.getByRole("textbox", { name: "Outline node text" }).evaluate((element, eventInit) => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...eventInit
      })
    );
  }, init);
}

async function pastePlainText(page: import("@playwright/test").Page, text: string) {
  const textbox = page.getByRole("textbox", { name: "Outline node text" });
  await textbox.focus();
  await textbox.evaluate((element, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true
      })
    );
  }, text);
}

function outlineText(page: import("@playwright/test").Page, text: string) {
  return page.getByRole("tree", { name: "Outline" }).getByText(text, { exact: true });
}

async function expectRowOrder(page: import("@playwright/test").Page, texts: string[]) {
  await expect
    .poll(async () =>
      page.locator(".outline-row").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-node-text")))
    )
    .toEqual(texts);
}

async function openFreshPage(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("local-first-outliner");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });
  await page.reload();
}
