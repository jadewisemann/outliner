import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("wiped")) return;
    sessionStorage.setItem("wiped", "1");
    indexedDB.deleteDatabase("outliner");
  });
  await page.goto("/");
});

test("display settings change the text and survive a reload", async ({ page }) => {
  await page.keyboard.press("Control+Shift+p");
  await page.locator(".search-input").fill(">표시 설정");
  await page.keyboard.press("Enter");

  await page.getByRole("button", { name: "세리프", exact: true }).click();
  const size = page.locator(".settings-body input[type=range]").first();
  await size.fill("21");
  await page.keyboard.press("Escape");

  const read = () => page.evaluate(() => getComputedStyle(document.body).fontSize);
  expect(await read()).toBe("21px");

  await page.reload();
  expect(await read()).toBe("21px");
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("Charter");
});

test("a rebound shortcut takes effect and the old one stops working", async ({ page }) => {
  await page.locator(".row").first().click();
  await page.keyboard.type("word");
  await page.keyboard.press("Control+a");

  await page.keyboard.press("Control+Shift+p");
  await page.locator(".search-input").fill(">단축키 바꾸기");
  await page.keyboard.press("Enter");

  // Bold moves from ⌘B to ⌘J.
  await page.getByRole("button", { name: "Ctrl+B" }).click();
  await page.keyboard.press("Control+j");
  await expect(page.getByRole("button", { name: "Ctrl+J" })).toHaveCount(1);
  await page.keyboard.press("Escape");

  await page.locator(".row").first().click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+b");
  await expect(page.locator("textarea.row-input")).toHaveValue("word");

  await page.keyboard.press("Control+j");
  await expect(page.locator("textarea.row-input")).toHaveValue("**word**");
});
