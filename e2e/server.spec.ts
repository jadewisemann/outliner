import { spawn, type ChildProcessByStdio } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * The reference server, run for real.
 *
 * Everything else about sync is checked against a fake remote inside the
 * browser, which proves the client keeps its side of the contract but cannot
 * say whether the server in `server/` keeps its own. This spec starts that
 * file as its own process on a port and syncs two devices through it, so the
 * things a route interceptor cannot have wrong — the ETag surviving a
 * cross-origin read, `If-Match` actually refusing a stale write — are held to
 * the real thing.
 */

const TOKEN = "reference-server-token";

let server: ChildProcessByStdio<null, Readable, Readable>;
let directory: string;
let origin: string;

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "outliner-server-"));
  server = spawn(
    process.execPath,
    ["server/outliner-server.mjs", "--port", "0", "--host", "127.0.0.1", "--dir", directory, "--token", TOKEN],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  origin = await new Promise<string>((done, fail) => {
    const timer = setTimeout(() => fail(new Error("the reference server never reported a port")), 15_000);
    server.stdout.on("data", (chunk: Buffer) => {
      const found = /outliner server on (http:\/\/\S+)/.exec(chunk.toString());
      if (!found) return;
      clearTimeout(timer);
      done(found[1]);
    });
    server.stderr.on("data", (chunk: Buffer) => {
      clearTimeout(timer);
      fail(new Error(`the reference server failed to start: ${chunk.toString()}`));
    });
  });
});

test.afterAll(async () => {
  server?.kill();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function openSynced(context: BrowserContext, url: string): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript(
    ([endpoint, token]) => localStorage.setItem("outliner:sync", JSON.stringify({ url: endpoint, token })),
    [`${origin}/workspace`, TOKEN]
  );
  await page.goto(url);
  await page.locator(".row").first().click();
  return page;
}

test("two devices reach the same outline through the reference server", async ({ browser, baseURL }) => {
  const laptop = await browser.newContext();
  const phone = await browser.newContext();

  const one = await openSynced(laptop, baseURL!);
  await one.keyboard.type("stored by the reference server");

  const two = await openSynced(phone, baseURL!);
  await expect(two.getByText("stored by the reference server")).toBeVisible({ timeout: 20_000 });

  // The second device's own row has to come back the other way, or the server
  // took the write and never handed it on.
  await two.locator(".row").last().click();
  await two.keyboard.press("End");
  await two.keyboard.press("Enter");
  await two.keyboard.type("written on the second device");
  await expect(one.getByText("written on the second device")).toBeVisible({ timeout: 20_000 });

  await laptop.close();
  await phone.close();
});

test("hands a browser on another origin the ETag its compare-and-swap needs", async ({ page, baseURL }) => {
  await page.goto(baseURL!);

  const seen = await page.evaluate(
    async ([url, token]) => {
      const written = await fetch(url, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "if-match": "*" },
        body: JSON.stringify({ docs: {}, graves: {} })
      });
      const read = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      const stale = await fetch(url, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "if-match": '"not-the-one"' },
        body: JSON.stringify({ docs: {}, graves: {} })
      });
      return { written: written.headers.get("etag"), read: read.headers.get("etag"), stale: stale.status };
    },
    [`${origin}/workspace`, TOKEN]
  );

  // Without `Access-Control-Expose-Headers` these read as null in the browser
  // while looking perfectly fine to curl, and every push would go out
  // unconditional with the client none the wiser.
  expect(seen.read).toMatch(/^"[0-9a-f]{32}"$/);
  expect(seen.written).toBe(seen.read);
  // And the refusal the client turns into "pull and merge again".
  expect(seen.stale).toBe(412);
});
