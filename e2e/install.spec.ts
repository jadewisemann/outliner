import { expect, test } from "@playwright/test";

/** The manifest and its icons only exist in the built output. */
const BUILT = "http://127.0.0.1:4173/";

test("the built app can be installed to a home screen", async ({ page, request }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) violations.push(message.text());
  });
  await page.goto(BUILT);

  // Asking the browser rather than the server: this is a real fetch under the
  // page's own policy, parsed by the code that would install the app.
  const cdp = await page.context().newCDPSession(page);
  const app = await cdp.send("Page.getAppManifest");
  expect(app.data, "the browser could not read the manifest").toBeTruthy();
  expect(app.errors.filter((error) => error.critical !== 0)).toEqual([]);

  const manifest = JSON.parse(app.data!);
  expect(manifest.display).toBe("standalone");
  // Relative, so the app still works served from a subpath — which is how
  // GitHub Pages serves anything but a user site.
  expect(manifest.start_url).toBe("./");
  expect(manifest.scope).toBe("./");
  // A maskable icon is cropped to a circle; without one, a launcher pads the
  // icon into a white tile.
  expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose?.includes("maskable"))).toBe(true);

  for (const icon of [...manifest.icons.map((icon: { src: string }) => icon.src), "./apple-touch-icon.png"]) {
    const response = await request.get(new URL(icon, BUILT).href);
    expect(response.ok(), `${icon} is missing`).toBe(true);
  }

  expect(violations).toEqual([]);
});

test("the built app opens again with the network gone", async ({ page, context }) => {
  await page.goto(BUILT);
  await page.locator(".row").first().click();
  await page.keyboard.type("written while online");

  // The worker only helps once it controls the page.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10_000 });
  // Let the shell and its assets reach the cache.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10_000 });

  await context.setOffline(true);
  await page.reload();

  // Opening at all is the point; the notes were never on the server.
  await expect(page.getByText("written while online")).toBeVisible();
  await context.setOffline(false);
});
