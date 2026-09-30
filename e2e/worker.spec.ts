import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * The Cloudflare Worker backend (`server/cloudflare/`), run on the real
 * Workers runtime: `wrangler dev` executes it in workerd with a real
 * SQLite-backed Durable Object, the same engine as a deployment. What a fake
 * cannot answer is answered here — whether the Durable Object really makes
 * read-compare-write one step, and whether a workspace larger than a single
 * stored value (2 MB) survives being cut into chunks.
 *
 * Needs `WORKER_URL` (the sync URL, ending in /workspace) and `WORKER_TOKEN`;
 * skipped without them. CI starts the runtime (.github/workflows/worker.yml).
 */

const URL_ = process.env.WORKER_URL ?? "";
const TOKEN = process.env.WORKER_TOKEN ?? "";
test.skip(URL_ === "", "WORKER_URL is not set; the Workers runtime is started by CI");

const auth = { authorization: `Bearer ${TOKEN}` };

async function put(body: string, ifMatch?: string): Promise<Response> {
  return fetch(URL_, {
    method: "PUT",
    headers: { ...auth, "content-type": "application/json", ...(ifMatch ? { "if-match": ifMatch } : {}) },
    body
  });
}

/** Starts every test from an empty remote, whatever the last one left. */
test.beforeEach(async () => {
  const current = await fetch(URL_, { headers: auth });
  if (current.status === 200) {
    // An empty object reads back as "no documents", which the app treats like an empty remote.
    expect((await put("{}", current.headers.get("etag")!)).status).toBe(204);
  }
});

test("refuses requests without the token, and answers CORS preflights", async () => {
  expect((await fetch(URL_)).status).toBe(401);
  expect((await fetch(URL_, { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
  const preflight = await fetch(URL_, { method: "OPTIONS" });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("access-control-expose-headers")).toBe("etag");
});

test("compare-and-swap: of many writers holding the same ETag, exactly one wins", async () => {
  const start = await fetch(URL_, { headers: auth });
  const etag = start.headers.get("etag")!;
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => put(JSON.stringify({ writer: i }), etag)));
  const statuses = results.map((response) => response.status).sort();
  expect(statuses.filter((status) => status === 204)).toHaveLength(1);
  expect(statuses.filter((status) => status === 412)).toHaveLength(11);

  const winner = results.find((response) => response.status === 204)!;
  const read = await fetch(URL_, { headers: auth });
  expect(read.headers.get("etag")).toBe(winner.headers.get("etag"));
});

test("a workspace larger than one stored value round-trips byte for byte", async () => {
  // ~7 MB of UTF-8: four chunks, each over the 2 MB value limit if stored whole.
  const body = JSON.stringify({ docs: {}, filler: "한글과 ASCII가 섞인 줄 ".repeat(260_000) });
  const start = await fetch(URL_, { headers: auth });
  const written = await put(body, start.headers.get("etag") ?? undefined);
  expect(written.status).toBe(204);
  const read = await fetch(URL_, { headers: auth });
  expect(read.status).toBe(200);
  expect(await read.text()).toBe(body);

  // Shrinking again leaves no stale tail behind.
  expect((await put("{}", read.headers.get("etag")!)).status).toBe(204);
  expect(await (await fetch(URL_, { headers: auth })).text()).toBe("{}");
});

async function openSynced(context: BrowserContext, url: string, passphrase?: string): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript(
    ([endpoint, token, secret]) =>
      localStorage.setItem(
        "outliner:sync",
        JSON.stringify({ kind: "rest", url: endpoint, token, ...(secret ? { passphrase: secret } : {}) })
      ),
    [URL_, TOKEN, passphrase ?? ""]
  );
  await page.goto(url);
  await page.locator(".row").first().click();
  return page;
}

test("two devices reach the same outline through the Worker", async ({ browser, baseURL }) => {
  const laptop = await browser.newContext();
  const phone = await browser.newContext();

  const one = await openSynced(laptop, baseURL!);
  await one.keyboard.type("Worker를 거쳐 간 줄");
  // The second device adopts the remote only on its very first sync. Joining
  // before the first device's push lands would keep its own starter document
  // next to the other one, and the row would be in a document not on screen.
  await expect
    .poll(async () => (await fetch(URL_, { headers: auth })).text(), { timeout: 20_000 })
    .toContain("Worker를 거쳐 간 줄");
  const two = await openSynced(phone, baseURL!);
  await expect(two.getByText("Worker를 거쳐 간 줄")).toBeVisible({ timeout: 20_000 });

  await two.locator(".row").last().click();
  await two.keyboard.press("End");
  await two.keyboard.press("Enter");
  await two.keyboard.type("폰에서 돌아온 줄");
  await expect(one.getByText("폰에서 돌아온 줄")).toBeVisible({ timeout: 20_000 });

  await laptop.close();
  await phone.close();
});

test("with a passphrase the Worker stores only ciphertext", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const page = await openSynced(context, baseURL!, "워커 암호");
  await page.keyboard.type("서버가 읽으면 안 되는 문장");

  await expect
    .poll(async () => (await fetch(URL_, { headers: auth })).text(), { timeout: 20_000 })
    .toContain('"ct"');
  const stored = await (await fetch(URL_, { headers: auth })).text();
  expect(stored).not.toContain("서버가 읽으면 안 되는 문장");

  // And a second device with the same passphrase reads it back.
  const other = await browser.newContext();
  const second = await openSynced(other, baseURL!, "워커 암호");
  await expect(second.getByText("서버가 읽으면 안 되는 문장")).toBeVisible({ timeout: 20_000 });
  await context.close();
  await other.close();
});
