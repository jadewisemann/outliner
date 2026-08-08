import { expect, test, type Page } from "@playwright/test";

const ROWS = 2000;

async function paste(page: Page, text: string) {
  await page.evaluate((value) => {
    const area = document.querySelector<HTMLTextAreaElement>("textarea.row-input")!;
    const data = new DataTransfer();
    data.setData("text/plain", value);
    area.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => indexedDB.deleteDatabase("outliner"));
  await page.goto("/");
  await page.locator(".row").first().click();
  await paste(page, Array.from({ length: ROWS }, (_, index) => `line ${index + 1}`).join("\n"));
  await expect(page.locator(".row").first()).toBeVisible();
});

test("keeps the DOM small and the whole document reachable", async ({ page }) => {
  const rendered = await page.locator(".row").count();
  expect(rendered).toBeGreaterThan(5);
  expect(rendered).toBeLessThan(200);

  // The scrollbar still reflects all 2000 rows.
  const scrollable = await page.evaluate(() => {
    const main = document.querySelector(".main")!;
    return main.scrollHeight > main.clientHeight * 10;
  });
  expect(scrollable).toBe(true);

  await page.evaluate(() => {
    const main = document.querySelector(".main")!;
    main.scrollTop = main.scrollHeight;
  });
  await expect(page.getByText(`line ${ROWS}`, { exact: true })).toBeVisible();
  expect(await page.locator(".row").count()).toBeLessThan(200);

  await page.evaluate(() => {
    document.querySelector(".main")!.scrollTop = 0;
  });
  await expect(page.getByText("line 1", { exact: true })).toBeVisible();

  // And it stays there. The row being edited is 2000 lines down; hauling the
  // page back to it a moment later would make a long document unreadable.
  await page.waitForTimeout(1000);
  await expect(page.getByText("line 1", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.querySelector(".main")!.scrollTop)).toBe(0);
});

test("search jumps to a row far outside the rendered window", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await page.locator(".search-input").fill("line 1750");
  await page.locator(".search-hit").first().click();

  await expect(page.locator("textarea.row-input")).toHaveValue("line 1750");
  await expect(page.locator("textarea.row-input")).toBeFocused();
});

test("typing stays responsive with the document loaded", async ({ page }) => {
  await page.locator(".row").first().click();
  await page.keyboard.press("End");

  const elapsed = await page.evaluate(async () => {
    const area = document.querySelector<HTMLTextAreaElement>("textarea.row-input")!;
    const start = performance.now();
    for (let index = 0; index < 30; index += 1) {
      area.value += "x";
      area.dispatchEvent(new InputEvent("input", { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return performance.now() - start;
  });

  // 30 keystrokes, each waiting a frame. Generous bound — this fails loudly if
  // a change starts re-rendering all 2000 rows on every keystroke.
  expect(elapsed).toBeLessThan(3000);
});
