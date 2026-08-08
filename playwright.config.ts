import { defineConfig, devices } from "@playwright/test";

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
        // Use the browser that ships with the image instead of downloading one.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {}
      }
    }
  ]
});
