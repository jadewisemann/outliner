import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const SYNC_URL = "https://sync.test/outline.json";

async function rowTexts(page: Page): Promise<string[]> {
  return page.$$eval(".row", (rows) =>
    rows.map((row) => {
      const editor = row.querySelector<HTMLTextAreaElement>("textarea.row-input");
      return editor ? editor.value : (row.querySelector(".row-rendered")?.textContent ?? "").trim();
    })
  );
}

/** Stands in for the remote: one JSON document, GET and PUT, nothing else. */
async function serveSharedDocument(contexts: BrowserContext[]) {
  let stored: string | null = null;

  await Promise.all(
    contexts.map((context) =>
      context.route(SYNC_URL, async (route) => {
        if (route.request().method() === "PUT") {
          stored = route.request().postData();
          await route.fulfill({ status: 200, body: "{}" });
          return;
        }
        await route.fulfill({ status: stored ? 200 : 404, contentType: "application/json", body: stored ?? "" });
      })
    )
  );

  return {
    /** Resolves once a device has actually pushed the text — the honest signal. */
    async uploaded(text: string) {
      await expect
        .poll(() => stored?.includes(text) ?? false, { timeout: 20_000, message: `remote never received "${text}"` })
        .toBe(true);
    }
  };
}

async function openSynced(context: BrowserContext, url: string): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript(
    ([endpoint]) => localStorage.setItem("outliner:sync", JSON.stringify({ url: endpoint, token: "" })),
    [SYNC_URL]
  );
  await page.goto(url);
  await page.locator(".row").first().click();
  return page;
}

test("two devices merge edits they made independently", async ({ browser, baseURL }) => {
  const laptop = await browser.newContext();
  const phone = await browser.newContext();
  const remote = await serveSharedDocument([laptop, phone]);

  const one = await openSynced(laptop, baseURL!);
  await one.keyboard.type("written on the laptop");
  await remote.uploaded("written on the laptop");

  const two = await openSynced(phone, baseURL!);
  await expect(two.getByText("written on the laptop")).toBeVisible({ timeout: 10_000 });

  // Both devices add a row without seeing the other's.
  await two.locator(".row").last().click();
  await two.keyboard.press("End");
  await two.keyboard.press("Enter");
  await two.keyboard.type("written on the phone");

  await expect(two.getByText("written on the laptop")).toBeVisible({ timeout: 10_000 });
  await expect(one.getByText("written on the phone")).toBeVisible({ timeout: 15_000 });

  expect((await rowTexts(one)).filter(Boolean).sort()).toEqual(["written on the laptop", "written on the phone"]);

  await laptop.close();
  await phone.close();
});

test("a delete on one device is not undone by the other", async ({ browser, baseURL }) => {
  const laptop = await browser.newContext();
  const phone = await browser.newContext();
  const remote = await serveSharedDocument([laptop, phone]);

  const one = await openSynced(laptop, baseURL!);
  await one.keyboard.type("keep me");
  await one.keyboard.press("Enter");
  await one.keyboard.type("delete me");
  await remote.uploaded("delete me");

  const two = await openSynced(phone, baseURL!);
  await expect(two.getByText("delete me")).toBeVisible({ timeout: 10_000 });

  // Remove it on the laptop; the phone still has the row in memory.
  await one.locator(".row", { hasText: "delete me" }).first().click();
  await one.keyboard.press("Escape");
  await one.keyboard.press("Backspace");

  await expect(two.getByText("delete me")).toHaveCount(0, { timeout: 15_000 });
  await expect(two.getByText("keep me")).toBeVisible();

  await laptop.close();
  await phone.close();
});

test("a second tab of the same browser picks up the changes", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  await first.goto(baseURL!);
  await first.locator(".row").first().click();
  await first.keyboard.type("typed in the first tab");

  const second = await context.newPage();
  await second.goto(baseURL!);
  await expect(second.getByText("typed in the first tab")).toBeVisible({ timeout: 10_000 });

  await second.locator(".row").last().click();
  await second.keyboard.press("End");
  await second.keyboard.press("Enter");
  await second.keyboard.type("typed in the second tab");

  await expect(first.getByText("typed in the second tab")).toBeVisible({ timeout: 10_000 });

  await context.close();
});
