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

test("a hostile endpoint cannot destroy the local document", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  // Serves garbage, then a payload crafted to bury everything.
  let phase = 0;
  const bodies = [
    "<!doctype html><h1>captive portal</h1>",
    JSON.stringify({ docs: null }),
    JSON.stringify({ docs: { a: null }, graves: { a: { at: 9e15, by: "zzz" } } }),
    JSON.stringify({ docs: {}, graves: { "__proto__": { at: 9e15, by: "zzz" } } })
  ];
  await context.route(SYNC_URL, async (route) => {
    if (route.request().method() === "PUT") return route.fulfill({ status: 200, body: "{}" });
    return route.fulfill({ status: 200, contentType: "application/json", body: bodies[phase++ % bodies.length] });
  });

  const page = await openSynced(context, baseURL!);
  await page.keyboard.type("my only copy of this note");
  await page.waitForTimeout(6000);

  await expect(page.getByText("my only copy of this note")).toBeVisible();
  expect(await rowTexts(page)).toContain("my only copy of this note");
  await context.close();
});

test("an unreachable endpoint reports itself and backs off", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  let requests = 0;
  await context.route(SYNC_URL, async (route) => {
    requests += 1;
    await route.fulfill({ status: 500, body: "nope" });
  });

  const page = await openSynced(context, baseURL!);
  await page.keyboard.type("still editable while sync is broken");
  await expect(page.locator(".sync-badge.sync-error")).toBeVisible({ timeout: 10_000 });

  const afterFirst = requests;
  await page.waitForTimeout(8000);
  // Without backoff this would be another ~5 attempts per second of waiting.
  expect(requests - afterFirst).toBeLessThan(6);
  expect(await rowTexts(page)).toContain("still editable while sync is broken");
  await context.close();
});

test("an undone edit is not brought back by the next sync", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const remote = await serveSharedDocument([context]);

  const page = await openSynced(context, baseURL!);
  await page.keyboard.type("keep this");
  await page.keyboard.press("Enter");
  await page.keyboard.type("regret this");
  await remote.uploaded("regret this");

  await page.keyboard.press("Control+z");
  await expect(page.getByText("regret this")).toHaveCount(0);

  // Long enough for two full pull/merge rounds to run.
  await page.waitForTimeout(12_000);
  expect(await rowTexts(page)).not.toContain("regret this");
  await context.close();
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
