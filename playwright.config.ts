import { defineConfig, devices } from "@playwright/test";

// Set PW_CHROMIUM_PATH to run against a preinstalled Chromium instead of Playwright's own download.
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  use: { baseURL: "http://localhost:4173" },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173",
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "pixel",
      use: { ...devices["Pixel 7"], ...(executablePath ? { launchOptions: { executablePath } } : {}) },
    },
  ],
});
