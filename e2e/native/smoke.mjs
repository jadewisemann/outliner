#!/usr/bin/env node
/**
 * Drives the built desktop app (not a browser) through tauri-driver, over the
 * plain W3C WebDriver protocol — no client library, so nothing to install.
 *
 * What only the real shell can show, and the browser e2e cannot:
 *  - the page gets `window.__TAURI__` and the commands answer (IPC works under
 *    the app's own CSP);
 *  - the folder backend really writes `outliner.json` to disk, and picks up a
 *    conflict copy dropped next to it;
 *  - the app renders and takes typing (a screenshot is kept as evidence).
 *
 *     tauri-driver &   # listens on 4444
 *     node e2e/native/smoke.mjs <path to app binary> <evidence dir>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [application, evidence = "evidence"] = process.argv.slice(2);
if (!application) throw new Error("usage: smoke.mjs <app binary> [evidence dir]");
const DRIVER = process.env.WEBDRIVER_URL ?? "http://127.0.0.1:4444";
const folder = join(tmpdir(), `outliner-native-${Date.now()}`);
// Where the shell keeps its data (Tauri's app_data_dir): given by the caller
// on Windows, Linux's XDG location otherwise.
const appData = process.env.OUTLINER_APP_DATA ?? join(process.env.HOME ?? "", ".local/share/io.github.jadewisemann.outliner");
mkdirSync(evidence, { recursive: true });

async function call(method, path, body) {
  const response = await fetch(`${DRIVER}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await response.json();
  if (!response.ok || json.value?.error) throw new Error(`${method} ${path}: ${JSON.stringify(json.value)}`);
  return json.value;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function until(what, check, timeout = 30_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await check();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what}: ${last}`);
}

const session = await call("POST", "/session", {
  capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": { application } } }
});
const id = session.sessionId;
const S = `/session/${id}`;
const run = (script, args = []) => call("POST", `${S}/execute/sync`, { script, args });
const runAsync = (script, args = []) => call("POST", `${S}/execute/async`, { script, args });
const shot = async (name) => writeFileSync(join(evidence, `${name}.png`), Buffer.from(await call("GET", `${S}/screenshot`), "base64"));
const find = async (css) => Object.values(await call("POST", `${S}/element`, { using: "css selector", value: css }))[0];

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

try {
  await until("the outline", () => run("return document.querySelectorAll('.row').length > 0"));
  await shot("start");

  // 1. The bridge exists and answers.
  const info = await runAsync(
    "const done = arguments[arguments.length - 1]; window.__TAURI__.core.invoke('native_info').then(done, e => done({ error: String(e) }))"
  );
  check("native_info answers over IPC", info && info.mobile === false, JSON.stringify(info));


  // 2. Typing works in the shell's webview.
  const row = await find(".row");
  await call("POST", `${S}/element/${row}/click`, {});
  const active = Object.values(await call("GET", `${S}/element/active`))[0];
  await call("POST", `${S}/element/${active}/value`, { text: "네이티브에서 쓴 줄" });
  await until("the typed row", () => run("return document.body.innerText.includes('네이티브에서 쓴 줄') || [...document.querySelectorAll('textarea')].some(t => t.value.includes('네이티브에서 쓴 줄'))"));
  check("typing reaches the outline", true);

  // 2b. Every save also lands in the app's own file (the replica).
  const replica = join(appData, "workspace.json");
  await until("the replica file", () => existsSync(replica) && readFileSync(replica, "utf8").includes("네이티브에서 쓴 줄"), 15_000);
  check("local save writes the replica", true, replica);

  // 3. A folder nobody allowed is refused, whatever the page asks.
  const refused = await runAsync(
    "const done = arguments[arguments.length - 1]; window.__TAURI__.core.invoke('folder_read', { dir: arguments[0] }).then(() => done('read'), e => done(String(e)))",
    [folder]
  );
  check("an unallowed folder is refused", /not been allowed/.test(refused), refused);

  // 4. The folder backend writes the canonical file. Allowing happens through
  // the shell's picker or its native dialog, neither of which a WebDriver
  // session can drive, so the allow list is written the way the shell would.
  writeFileSync(join(appData, "allowed-folders.txt"), `${folder}\n`);
  await run("localStorage.setItem('outliner:sync', JSON.stringify({ kind: 'file', dir: arguments[0] }))", [folder]);
  // Let the debounced local save land before reloading.
  await sleep(1000);
  await run("location.reload()");
  await until("the outline after reload", () => run("return document.querySelectorAll('.row').length > 0"));
  const file = join(folder, "outliner.json");
  await until("outliner.json on disk", () => existsSync(file) && readFileSync(file, "utf8").includes("네이티브에서 쓴 줄"));
  check("folder backend writes outliner.json", true, file);

  // 4. A conflict copy is merged in and then removed.
  const copy = JSON.parse(readFileSync(file, "utf8"));
  const doc = Object.values(copy.docs)[0];
  const rowId = "native-smoke-copy-row";
  const now = { at: Date.now() + 1000, by: "smoke" };
  doc.nodes[rowId] = {
    ...Object.values(doc.nodes).find((node) => node.id !== doc.rootId),
    id: rowId,
    text: "충돌 사본에서 온 줄",
    parent: doc.rootId,
    sort: "zz",
    children: [],
    created: now,
    edited: now,
    moved: now
  };
  const copyName = join(folder, "outliner (conflicted copy).json");
  writeFileSync(copyName, JSON.stringify(copy));
  await until("the copy merged into the app", () => run("return document.body.innerText.includes('충돌 사본에서 온 줄')"), 45_000);
  await until("the copy moved aside", () => !existsSync(copyName), 20_000);
  check(
    "conflict copy is merged and moved into .outliner-merged",
    readFileSync(file, "utf8").includes("충돌 사본에서 온 줄") && existsSync(join(folder, ".outliner-merged"))
  );

  // 5. The sync badge reports success rather than an error.
  const badge = await run("const b = document.querySelector('.sync-badge'); return b ? b.className : ''");
  check("sync badge is not in error", !/sync-(error|locked|offline)/.test(badge), badge);

  await shot("synced");
} catch (error) {
  check("smoke run", false, String(error?.stack ?? error));
  try {
    await shot("failure");
  } catch {
    /* no screenshot either */
  }
} finally {
  await call("DELETE", S).catch(() => {});
  rmSync(folder, { recursive: true, force: true });
  writeFileSync(join(evidence, "smoke.json"), JSON.stringify(results, null, 2));
}

if (results.some((result) => !result.ok)) process.exit(1);
