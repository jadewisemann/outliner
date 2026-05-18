import { expect, test, type BrowserContext, type Page } from "@playwright/test";

test("syncs edits between two browser pages through a browser-backed remote store", async ({ context }) => {
  const workspace = `e2e-${Date.now()}`;
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await resetBrowserState(pageA);
  await pageA.goto(`/?remote=browser&workspace=${workspace}`);
  await pageB.goto(`/?remote=browser&workspace=${workspace}`);

  await expect(pageA.getByText("Synced")).toBeVisible();
  await expect(pageB.getByText("Synced")).toBeVisible();

  await pastePlainText(pageA, "A\nB");

  await expect(outlineText(pageA, "A")).toBeVisible();
  await expect(outlineText(pageB, "A")).toBeVisible();
  await expect(outlineText(pageB, "B")).toBeVisible();

  await focusRow(pageB, "B");
  await pastePlainText(pageB, "\nC from B");

  await expect(outlineText(pageB, "BC from B")).toBeVisible();
  await expect(outlineText(pageA, "BC from B")).toBeVisible();
});

async function resetBrowserState(page: Page) {
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
}

async function pastePlainText(page: Page, text: string) {
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

async function focusRow(page: Page, text: string) {
  await outlineText(page, text).click();
  const textbox = page.getByRole("textbox", { name: "Outline node text" });
  await expect(textbox).toContainText(text);
  await expect(textbox).toBeFocused();
}

function outlineText(page: Page, text: string) {
  return page.getByRole("tree", { name: "Outline" }).getByText(text, { exact: true });
}
