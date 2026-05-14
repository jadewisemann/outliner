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
  await page.keyboard.press("Tab");

  await page.getByRole("button", { name: "Collapse node" }).first().click();
  await expect(outlineText(page, "B")).toBeHidden();
  await expect(outlineText(page, "C")).toBeHidden();
  await expect(outlineText(page, "D")).toBeVisible();
  await page.getByRole("button", { name: "Expand node" }).first().click();

  await selectRangeFromFocusedRow(page, "B", 1);
  await page.keyboard.press("Backspace");

  await expect(outlineText(page, "A")).toBeVisible();
  await expect(outlineText(page, "B")).toBeHidden();
  await expect(outlineText(page, "C")).toBeHidden();
  await expect(outlineText(page, "D")).toBeVisible();
});

async function selectRangeFromFocusedRow(page: import("@playwright/test").Page, firstText: string, arrowDownCount: number) {
  await outlineText(page, firstText).click();
  await expect(page.getByRole("textbox", { name: "Outline node text" })).toContainText(firstText);
  await expect(page.getByRole("textbox", { name: "Outline node text" })).toBeFocused();
  await page.keyboard.down("Shift");
  for (let index = 0; index < arrowDownCount; index += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.up("Shift");
  await expect(page.locator(".outline-row-selected")).toHaveCount(arrowDownCount + 1);
  await expect(page.getByRole("textbox", { name: "Outline node text" })).toBeFocused();
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
