import { defineConfig, devices } from "@playwright/test";
import { validateE2eTargetDatabaseUrl } from "./scripts/lib/e2e-database";

const databaseUrl = process.env.DATABASE_URL;
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

if (!databaseUrl || !adminEmail || !adminPassword) {
  throw new Error("E2E Playwright environment is not configured.");
}
validateE2eTargetDatabaseUrl(databaseUrl);

const origin = "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: origin,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
