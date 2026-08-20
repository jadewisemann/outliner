import { expect, test } from "@playwright/test";

/**
 * The policy lives in a meta tag, so it only applies to the built app — the dev
 * server is served a loosened copy. This spec therefore runs against `vite
 * preview`, which serves exactly what a static host would.
 */
const BUILT = "http://127.0.0.1:4173/";

/** Collects violations from the page itself, since they are not console errors. */
async function watchViolations(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.defineProperty(window, "__violations", { value: seen });
    document.addEventListener("securitypolicyviolation", (event) =>
      seen.push(`${event.violatedDirective} ${event.blockedURI}`)
    );
  });
  return () => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);
}

test("the built app does its work under its own policy", async ({ page }) => {
  const violations = await watchViolations(page);
  await page.goto(BUILT);

  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(policy).toContain("script-src 'self'");
  // The loosening is for the dev server only; it must not reach the build.
  expect(policy).not.toMatch(/script-src[^;]*unsafe/);
  expect(policy).not.toMatch(/style-src [^;]*unsafe/);

  // A pass over the parts that would notice a policy: editing, the second
  // document, the search panel, and the styles the outline sets per row.
  await page.locator(".row").first().click();
  await page.keyboard.type("정책 아래에서 쓴 줄");
  await page.keyboard.press("Tab");
  await page.locator('[title="새 문서"]').click();
  await page.keyboard.type("second");
  await page.keyboard.press("Control+Shift+f");
  await page.locator(".search-input").fill("정책");
  await expect(page.locator(".search-hit").first()).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.getByText("second")).toBeVisible();
  expect(await violations()).toEqual([]);
});

test("an injected inline script does not run", async ({ page }) => {
  const violations = await watchViolations(page);
  await page.goto(BUILT);
  await page.locator(".row").first().click();

  // What the policy is actually for: a token in localStorage is only as safe as
  // the guarantee that nothing else gets to execute here.
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.__ran = true";
    document.body.append(script);
  });

  expect(await page.evaluate(() => (window as unknown as { __ran?: boolean }).__ran)).toBeUndefined();
  expect(await violations()).toContainEqual(expect.stringContaining("script-src"));
});
