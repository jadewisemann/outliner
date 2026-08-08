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

/**
 * The GitHub contents API for one repository, in memory: GET a file or a
 * folder, read a blob by sha, PUT and DELETE with a sha that has to be current
 * — the same compare-and-swap the real thing enforces. Shared across contexts,
 * so two browsers are two devices talking to one repository.
 */
async function serveRepository(contexts: BrowserContext[], repo: string) {
  const files = new Map<string, { text: string; sha: string }>();
  const writes: string[] = [];
  let counter = 0;

  const store = (path: string, text: string) => {
    counter += 1;
    files.set(path, { text, sha: `sha-${counter}` });
    return files.get(path)!.sha;
  };

  await Promise.all(
    contexts.map((context) =>
      context.route(new RegExp(`^https://api\\.github\\.com/repos/${repo}/`), async (route) => {
        const url = new URL(route.request().url());
        const method = route.request().method();
        const posted = route.request().postData();
        const body = posted ? JSON.parse(posted) : {};
        const json = (status: number, value: unknown) =>
          route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });

        const blob = new RegExp(`^/repos/${repo}/git/blobs/(.+)$`).exec(url.pathname);
        if (blob) {
          const found = [...files.values()].find((file) => file.sha === decodeURIComponent(blob[1]));
          return found ? route.fulfill({ status: 200, contentType: "text/plain", body: found.text }) : json(404, {});
        }

        const prefix = `/repos/${repo}/contents/`;
        if (!url.pathname.startsWith(prefix)) return json(404, {});
        const path = url.pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
        const held = files.get(path);

        if (method === "GET") {
          if (held) {
            return json(200, {
              // GitHub wraps base64 at 60 columns; the client has to cope.
              content: Buffer.from(held.text, "utf8").toString("base64").replace(/(.{60})/g, "$1\n"),
              encoding: "base64",
              sha: held.sha
            });
          }
          const children = [...files.entries()]
            .filter(([at]) => at.startsWith(`${path}/`) && !at.slice(path.length + 1).includes("/"))
            .map(([at, file]) => ({ name: at.slice(path.length + 1), path: at, sha: file.sha, type: "file" }));
          return children.length > 0 ? json(200, children) : json(404, {});
        }

        if (method === "PUT") {
          if (held ? body.sha !== held.sha : Boolean(body.sha)) return json(409, {});
          const sha = store(path, Buffer.from(String(body.content).replace(/\s/g, ""), "base64").toString("utf8"));
          writes.push(path);
          return json(200, { content: { sha } });
        }

        if (method === "DELETE") {
          if (!held) return json(404, {});
          if (body.sha !== held.sha) return json(409, {});
          files.delete(path);
          writes.push(path);
          return json(200, {});
        }
        return json(405, {});
      })
    )
  );

  return {
    writes,
    documents: () => [...files.keys()].filter((path) => path.includes("/docs/")),
    text: (path: string) => files.get(path)?.text ?? "",
    async uploaded(text: string) {
      await expect
        .poll(() => [...files.values()].some((file) => file.text.includes(text)), {
          timeout: 40_000,
          message: `the repository never received "${text}"`
        })
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

test("a GitHub repository works as the backend, sha CAS and Korean text included", async ({ browser, baseURL }) => {
  // GitHub cadence is deliberately slow (push 10s, pull 30s), so this test
  // cannot fit Playwright's default 30s budget.
  test.setTimeout(120_000);
  const laptop = await browser.newContext();
  const phone = await browser.newContext();
  const repo = await serveRepository([laptop, phone], "tester/notes");

  const open = async (context: BrowserContext) => {
    const page = await context.newPage();
    await page.addInitScript(() =>
      localStorage.setItem(
        "outliner:sync",
        JSON.stringify({ kind: "github", repo: "tester/notes", path: "outliner", token: "test-pat" })
      )
    );
    await page.goto(baseURL!);
    await page.locator(".row").first().click();
    return page;
  };

  const one = await open(laptop);
  await one.keyboard.type("깃허브에 저장된 한글 노트");
  await repo.uploaded("깃허브에 저장된 한글 노트");
  expect(repo.documents()).toHaveLength(1);

  const two = await open(phone);
  await expect(two.getByText("깃허브에 저장된 한글 노트")).toBeVisible({ timeout: 15_000 });

  await two.locator(".row").last().click();
  await two.keyboard.press("End");
  await two.keyboard.press("Enter");
  await two.keyboard.type("폰에서 덧붙인 줄");
  await repo.uploaded("폰에서 덧붙인 줄");

  // Bring the laptop back to the front; visibility wake pulls, the 30s timer
  // is the fallback either way.
  await one.bringToFront();
  await expect(one.getByText("폰에서 덧붙인 줄")).toBeVisible({ timeout: 45_000 });

  await laptop.close();
  await phone.close();
});

test("editing one document commits only that document's file", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  const repo = await serveRepository([context], "tester/notes");

  const page = await context.newPage();
  await page.addInitScript(() =>
    localStorage.setItem(
      "outliner:sync",
      JSON.stringify({ kind: "github", repo: "tester/notes", path: "outliner", token: "test-pat" })
    )
  );
  await page.goto(baseURL!);

  await page.locator(".row").first().click();
  await page.keyboard.type("first document");
  await page.locator('[title="새 문서"]').click();
  await page.keyboard.type("second document");
  await repo.uploaded("second document");
  expect(repo.documents()).toHaveLength(2);

  const before = repo.writes.length;
  await page.keyboard.type(", extended");
  await repo.uploaded("second document, extended");

  // One file moved: the one holding the document that was typed into.
  const touched = [...new Set(repo.writes.slice(before))];
  expect(touched).toHaveLength(1);
  expect(repo.text(touched[0])).toContain("second document, extended");
  expect(repo.text(touched[0])).not.toContain("first document");
  await context.close();
});

test("signing in with GitHub lands in settings with the token in place, then syncs", async ({ browser, baseURL }) => {
  const context = await browser.newContext();

  // The serverless exchange, GitHub's user endpoint, and the contents API.
  await context.route("**/api/github-oauth", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "gho_test" }) })
      : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ clientId: "client1" }) })
  );
  await context.route("https://api.github.com/user", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ login: "tester" }) })
  );
  const repo = await serveRepository([context], "tester/outliner");

  const page = await context.newPage();
  // The state parameter must match what "this tab" stored before redirecting.
  await page.addInitScript(() => sessionStorage.setItem("outliner:oauth-state", "st-1"));
  await page.goto(`${baseURL}/?code=oauth-code&state=st-1`);

  // The exchange finishes and the settings panel opens itself, prefilled.
  const dialog = page.getByRole("dialog", { name: "기기 간 동기화" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByPlaceholder("owner/repository")).toHaveValue("tester/outliner");
  await expect(dialog.getByPlaceholder("github_pat_…")).toHaveValue("gho_test");
  // The spent code is gone from the URL, so a reload cannot replay it.
  expect(new URL(page.url()).searchParams.get("code")).toBeNull();

  await dialog.getByRole("button", { name: "저장하고 동기화" }).click();
  await page.locator(".row").first().click();
  await page.keyboard.type("로그인으로 연결된 노트");

  await repo.uploaded("로그인으로 연결된 노트");
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
