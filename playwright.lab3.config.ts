import { defineConfig } from "@playwright/test";
import { E2E_DATABASE_URL, E2E_UPLOAD_DIR } from "./e2e/test-environment.js";

export default defineConfig({
  testDir: "./e2e/lab-03",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: { baseURL: "http://localhost:5173", trace: "on-first-retry" },
  projects: [{ name: "desktop", use: { viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: "npm --prefix server run dev",
      url: "http://localhost:8000/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        UPLOAD_DIR: E2E_UPLOAD_DIR,
      },
    },
    { command: "npm --prefix client run dev", url: "http://localhost:5173", reuseExistingServer: false, timeout: 120_000 },
  ],
});
