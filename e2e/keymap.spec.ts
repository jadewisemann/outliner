import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("wiped")) return;
    sessionStorage.setItem("wiped", "1");
    indexedDB.deleteDatabase("outliner");
  });
  await page.goto("/");
});

/** The rebinding panel, which is where the presets live. */
async function openKeys(page: Page) {
  await page.keyboard.press("Control+Shift+p");
  await page.locator(".search-input").fill(">단축키 바꾸기");
  await page.keyboard.press("Enter");
  await expect(page.locator(".keys-panel")).toBeVisible();
}

async function buildTwoRows(page: Page) {
  await page.locator(".row").first().click();
  await page.keyboard.type("Project");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Task");
}

test("colour labels reach the keyboard, in the default preset", async ({ page }) => {
  // These were palette-only: the field existed and no key could set it.
  await page.locator(".row").first().click();
  await page.keyboard.type("red thing");

  await page.keyboard.press("Control+Shift+Digit1");
  await expect(page.locator(".row").first()).toHaveClass(/row-c1/);

  await page.keyboard.press("Control+Shift+Digit4");
  await expect(page.locator(".row").first()).toHaveClass(/row-c4/);

  await page.keyboard.press("Control+Shift+Digit0");
  await expect(page.locator(".row").first()).not.toHaveClass(/row-c\d/);

  // The text is untouched — ⌘⇧1 is a label, not typing.
  await expect(page.locator("textarea.row-input")).toHaveValue("red thing");
});

test("a colour key applies to a whole selection", async ({ page }) => {
  await page.locator(".row").first().click();
  await page.keyboard.type("one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("two");

  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+ArrowUp");
  await page.keyboard.press("Control+Shift+Digit2");

  await expect(page.locator(".row.row-c2")).toHaveCount(2);
});

test("collapse all and expand all fold the whole document", async ({ page }) => {
  await buildTwoRows(page);

  await page.keyboard.press("Control+Alt+BracketLeft");
  await expect(page.locator(".row-bullet-collapsed")).toHaveCount(1);

  await page.keyboard.press("Control+Alt+BracketRight");
  await expect(page.locator(".row-bullet-collapsed")).toHaveCount(0);
});

test("the Dynalist preset moves zoom onto ⌘] and leaves Tab indenting", async ({ page }) => {
  await buildTwoRows(page);

  await openKeys(page);
  await page.getByRole("button", { name: "Dynalist", exact: true }).click();
  await expect(page.locator(".keys-preset-active")).toHaveText("Dynalist");
  // Indent gave the brackets up rather than fighting zoom for them.
  await expect(page.locator(".keys-bind-unbound")).toHaveCount(2);
  await page.keyboard.press("Escape");

  // ⌘] is Dynalist's zoom in, not our indent.
  await page.locator(".row", { hasText: "Project" }).first().click();
  await page.keyboard.press("Control+BracketRight");
  await expect(page.locator(".doc-title-zoomed h1")).toHaveText("Project");

  await page.keyboard.press("Control+BracketLeft");
  await expect(page.locator(".doc-title-zoomed h1")).toHaveCount(0);
});

test("switching presets keeps Tab as indent, and survives a reload", async ({ page }) => {
  await openKeys(page);
  await page.getByRole("button", { name: "Dynalist", exact: true }).click();
  await page.keyboard.press("Escape");

  await page.locator(".row").first().click();
  await page.keyboard.type("a");
  await page.keyboard.press("Enter");
  await page.keyboard.type("b");
  // Tab is the editor rather than a binding, so no preset can take it away.
  await page.keyboard.press("Tab");
  await expect(page.locator(".row").nth(1)).toHaveCSS("--depth", "1");

  await page.reload();
  await openKeys(page);
  await expect(page.locator(".keys-preset-active")).toHaveText("Dynalist");
});

test("the help panel shows the keys that are actually bound", async ({ page }) => {
  await openKeys(page);
  await page.getByRole("button", { name: "Dynalist", exact: true }).click();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+Slash");
  await expect(page.locator(".shortcuts-preset")).toHaveText("Dynalist 프리셋");
  // Zoom reads ⌘] here, and the indent rows are gone with their bindings.
  await expect(page.locator(".shortcuts-grid dt", { hasText: "Ctrl+]" })).toHaveCount(1);
});
