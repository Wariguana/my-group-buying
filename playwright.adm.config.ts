import "dotenv/config";
import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { deriveE2eDatabaseUrl, validateE2eTargetDatabaseUrl } from "./scripts/lib/e2e-database";
const manifest = JSON.parse(readFileSync(".temp/adm-preview/manifest.json", "utf8"));
if (!manifest.complete) throw new Error("先執行 npm run adm:preview:seed。");
const target = deriveE2eDatabaseUrl(process.env.DATABASE_URL ?? "", manifest.database);
validateE2eTargetDatabaseUrl(target);
process.env.E2E_ADMIN_EMAIL = manifest.email;
process.env.E2E_ADMIN_PASSWORD = manifest.password;
export default defineConfig({
  testDir: "./e2e", testMatch: "adm-preview.pw.ts", workers: 1, timeout: 60000,
  outputDir: ".temp/adm-preview/browser-results", reporter: [["list"], ["html", { outputFolder: ".temp/adm-preview/report", open: "never" }]],
  use: { baseURL: "http://127.0.0.1:3200", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "adm-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "npm run adm:preview", url: "http://127.0.0.1:3200/admin/login", reuseExistingServer: true, timeout: 60000 },
});
