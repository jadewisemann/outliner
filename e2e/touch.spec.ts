import { devices, expect, test, type Page } from "@playwright/test";

/**
 * A phone has no Tab key, which makes indenting — the one thing an outline is
 * for — unreachable without a bar of its own.
 */

async function rows(page: Page) {
  return page.$$eval(".row", (found) =>
    found.map((row) => {
      const editor = row.querySelector<HTMLTextAreaElement>("textarea.row-input");
      const text = editor ? editor.value : (row.querySelector(".row-rendered")?.textContent ?? "").trim();
      return `${"  ".repeat(Number(getComputedStyle(row).getPropertyValue("--depth")))}${text}`;
    })
  );
}

const bar = (page: Page) => page.getByRole("toolbar", { name: "편집 도구" });

// Everything but `defaultBrowserType`, which cannot be overridden per describe.
const { defaultBrowserType: _browser, ...PHONE } = devices["Pixel 7"];

test.describe("on a phone", () => {
  test.use(PHONE);

  test("indents, outdents and reorders without a keyboard", async ({ page, baseURL }) => {
    await page.goto(baseURL!);
    await page.locator(".row").first().tap();
    await page.keyboard.type("parent");
    await page.keyboard.press("Enter");
    await page.keyboard.type("child");
    await expect(bar(page)).toBeVisible();

    await bar(page).getByRole("button", { name: "들여쓰기" }).tap();
    expect(await rows(page)).toEqual(["parent", "  child"]);
    // The caret has to stay in the row that just moved, or every press would
    // need the row tapped again first.
    await expect(page.locator("textarea.row-input")).toBeFocused();
    await page.keyboard.type("!");
    expect(await rows(page)).toEqual(["parent", "  child!"]);

    await bar(page).getByRole("button", { name: "내어쓰기" }).tap();
    expect(await rows(page)).toEqual(["parent", "child!"]);

    await bar(page).getByRole("button", { name: "위로 이동" }).tap();
    expect(await rows(page)).toEqual(["child!", "parent"]);
    await bar(page).getByRole("button", { name: "아래로 이동" }).tap();
    expect(await rows(page)).toEqual(["parent", "child!"]);
  });

  test("shows the bar only while a row is being edited", async ({ page, baseURL }) => {
    await page.goto(baseURL!);
    await expect(bar(page)).toBeHidden();

    await page.locator(".row").first().tap();
    await expect(bar(page)).toBeVisible();

    // Escape leaves the text and selects the row instead; the bar belongs to
    // editing, so it goes with it.
    await page.keyboard.press("Escape");
    await expect(bar(page)).toBeHidden();
  });
});

// The project's own device, so nothing to override here.
test.describe("on a desktop", () => {
  test("never shows the bar, since the keys are there", async ({ page, baseURL }) => {
    await page.goto(baseURL!);
    await page.locator(".row").first().click();
    await page.keyboard.type("typed with a keyboard");

    await expect(bar(page)).toBeHidden();
  });
});
