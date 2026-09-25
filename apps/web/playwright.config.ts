import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env["PROSEWIRE_ACCEPTANCE_URL"] ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./acceptance",
  globalSetup: "./acceptance/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["line"]] : "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env["PLAYWRIGHT_BROWSER_CHANNEL"],
      },
    },
  ],
  webServer: {
    command: "node acceptance/start-server.mjs",
    url: baseURL,
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
    env: {
      ...process.env,
      PROSEWIRE_PUBLIC_URL: baseURL,
      NEXT_PUBLIC_PROSEWIRE_PUBLIC_URL: baseURL,
      PROSEWIRE_DEPLOYMENT: "cloud",
      // Cloud startup requires storage settings; this suite does not upload media.
      PROSEWIRE_MEDIA_ENDPOINT: "http://127.0.0.1:9",
      PROSEWIRE_MEDIA_BUCKET: "acceptance",
      PROSEWIRE_MEDIA_ACCESS_KEY_ID: "acceptance-only",
      PROSEWIRE_MEDIA_SECRET_ACCESS_KEY: "acceptance-only",
      PROSEWIRE_MEDIA_PUBLIC_URL: "https://media.prosewire.test",
    },
  },
});
