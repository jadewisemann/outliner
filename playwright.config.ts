import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, defineConfig, devices } from "@playwright/test";

/**
 * The chromium to launch, or undefined to let Playwright use its own.
 *
 * Playwright pins an exact browser build and refuses to launch anything else by
 * default, which is a problem wherever the browsers were installed by something
 * other than `playwright install` — a prepared container, a distro package, a
 * shared cache. Upgrading `@playwright/test` moves the pin, so the image and the
 * package drift apart on their own schedule and every spec dies at launch: not a
 * few failures, **no e2e signal at all**. That failure is also the least
 * informative one possible, since the error names the path it wanted rather than
 * the browsers that are actually present.
 *
 * So: use what is there. A build that is one or two versions off runs these
 * specs fine — they are ordinary DOM, keyboard and CDP work, not anything
 * version-tender.
 */
function chromiumPath(): string | undefined {
  // An explicit path wins: it is how someone points at a browser this cannot
  // guess (a system Chrome, a build outside the browsers directory).
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;

  // When Playwright's own build is installed, stay out of the way — matching
  // versions are the supported path and this should not second-guess them.
  try {
    if (existsSync(chromium.executablePath())) return undefined;
  } catch {
    // Older/odd installs throw instead of answering; fall through and look.
  }

  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;

  // Newest build first, so a directory left over from an older image loses to
  // the current one. `chromium-1194` sorts before `chromium-983` as a string,
  // hence the numeric compare.
  const builds = readdirSync(root)
    .map((name) => ({ name, build: Number(name.match(/^chromium(?:_headless_shell)?-(\d+)$/)?.[1] ?? NaN) }))
    .filter((entry) => Number.isFinite(entry.build))
    .sort((a, b) => b.build - a.build);

  // The layout moved (`chrome-linux` → `chrome-linux64`) partway through
  // Playwright's history, so both spellings are tried. Full chrome before
  // `headless_shell`: the shell cannot do a headed run or an extension.
  const layouts = [
    "chrome-linux64/chrome",
    "chrome-linux/chrome",
    "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    "chrome-win/chrome.exe",
    "chrome-linux/headless_shell",
    "chrome-headless-shell-linux64/chrome-headless-shell"
  ];

  for (const { name } of builds) {
    for (const layout of layouts) {
      const candidate = join(root, name, layout);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

const executablePath = chromiumPath();

export default defineConfig({
  testDir: "./e2e",
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI
    },
    {
      // The Content-Security-Policy only takes effect in the built app, so one
      // spec needs the built app. Never reused: a stale `dist` would be tested
      // instead of the working tree.
      command: "npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false
    }
  ],
  use: {
    baseURL: "http://127.0.0.1:5173",
    permissions: ["clipboard-read", "clipboard-write"],
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: executablePath ? { executablePath } : {}
      }
    }
  ]
});
