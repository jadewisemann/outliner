import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * What the specs that run a real REST backend share: `server.spec.ts` (the
 * reference server) and `worker.spec.ts` (the Cloudflare Worker). Not a spec
 * itself, so Playwright does not collect it.
 */

/** Opens the app with sync already configured, stored as the settings panel stores it. */
export async function openSynced(context: BrowserContext, url: string, sync: Record<string, string>): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript((config) => localStorage.setItem("outliner:sync", config), JSON.stringify(sync));
  await page.goto(url);
  await page.locator(".row").first().click();
  return page;
}

/**
 * Two browser contexts are two devices on one remote. The first writes a row
 * and the second must see it; then the second writes one and the first must
 * see that, or the remote took the write and never handed it on.
 *
 * `stored` reads the remote's body directly, without a browser.
 */
export async function twoDevicesMeet(
  browser: Browser,
  url: string,
  sync: Record<string, string>,
  stored: () => Promise<string>,
  [first, second]: [string, string]
): Promise<void> {
  const laptop = await browser.newContext();
  const phone = await browser.newContext();

  const one = await openSynced(laptop, url, sync);
  await one.keyboard.type(first);
  // The second device adopts the remote only on its very first sync. Joining
  // before the first device's push lands would keep its own starter document
  // next to the other one, and the row would be in a document not on screen.
  await expect.poll(stored, { timeout: 20_000 }).toContain(first);
  const two = await openSynced(phone, url, sync);
  await expect(two.getByText(first)).toBeVisible({ timeout: 20_000 });

  await two.locator(".row").last().click();
  await two.keyboard.press("End");
  await two.keyboard.press("Enter");
  await two.keyboard.type(second);
  await expect(one.getByText(second)).toBeVisible({ timeout: 20_000 });

  await laptop.close();
  await phone.close();
}
