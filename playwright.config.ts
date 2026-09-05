import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/lab-02",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 45000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop",
      use: {
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "tablet",
      use: {
        viewport: { width: 834, height: 1112 },
      },
    },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: [
    {
      command: "npm --prefix server run dev",
      url: "http://localhost:8000/api/health",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        DATABASE_URL: "postgresql://toktickit:toktickit@localhost:5433/toktickit?schema=e2e_test",
        UPLOAD_DIR: "uploads_e2e",
      },
    },
    {
      command: "npm --prefix client run dev",
      url: "http://localhost:5173",
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
