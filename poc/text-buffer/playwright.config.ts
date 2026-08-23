import { defineConfig, devices } from "@playwright/test";
import { chromiumPath } from "../../playwright.config";

const executablePath = chromiumPath();

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    cwd: "../..",
    command: "./node_modules/.bin/vite --config poc/text-buffer/vite.config.ts --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: !process.env.CI
  },
  use: {
    baseURL: "http://127.0.0.1:5174",
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
