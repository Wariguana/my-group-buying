import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { validateE2eTargetDatabaseUrl } from "../scripts/lib/e2e-database";
import { startSpawnedProcess, waitForHttpServerReady, waitForServerExit, resolveNextCliPath } from "../scripts/lib/e2e-runner";

async function routes() {
  const inventory = JSON.parse(await readFile("docs/ux-audit/inventory.json", "utf8"));
  return { sourceDigest: inventory.sourceDigest as string, pages: inventory.routes.filter((route: { kind: string }) => route.kind === "page") as { route: string }[] };
}
function target(route: string) {
  return route.replace("[publicCode]", "ord-AbCdEf0123_-xyZ9").replace("[slug]", "gb-AbCdEf0123_-xyZ9").replaceAll(/\[[^\]]+\]/g, "aacc81cb-17a0-4034-a346-98ffb01fdc7c");
}
test("all pages expose the real streaming loading boundary during isolated session-read delay", async ({ browser }, info) => {
  test.setTimeout(180000);
  validateE2eTargetDatabaseUrl(process.env.DATABASE_URL!);
  const inventory = await routes();
  const db = new Client({ connectionString: process.env.DATABASE_URL!, connectionTimeoutMillis: 3000 });
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  const token = randomBytes(32).toString("base64url");
  await context.addCookies(["admin_session", "customer_session"].map(name => ({ name, value: token, url: "http://localhost:3100", httpOnly: true, sameSite: "Lax" as const })));
  const records: Record<string, unknown>[] = [];
  await db.connect();
  try {
    // Only the runner-owned random DB is locked. No data or schema is changed.
    await db.query("BEGIN");
    await db.query('LOCK TABLE "Session", "CustomerSession" IN ACCESS EXCLUSIVE MODE');
    for (const entry of inventory.pages) {
      await page.goto(target(entry.route), { waitUntil: "commit" });
      await expect(page.getByRole("status", { name: "" }).filter({ hasText: "正在載入，請稍候…" })).toBeVisible();
      await expect(page.getByRole("main", { name: "載入頁面" })).toHaveAttribute("aria-busy", "true");
      const screenshot = `loading-${entry.route.replaceAll(/[^a-z0-9]/gi, "-") || "home"}-390.png`;
      await page.screenshot({ path: info.outputPath(screenshot), animations: "disabled" });
      records.push({ route: entry.route, state: "loading", width: 390, screenshot });
    }
  } finally {
    await db.query("ROLLBACK"); await db.end();
    await writeFile(info.outputPath("loading-results.json"), JSON.stringify({ sourceDigest: inventory.sourceDigest, records }, null, 2));
    await context.close();
  }
});

test("all pages expose safe real error recovery when the isolated DB credential is invalid", async ({ browser }, info) => {
  test.setTimeout(180000);
  validateE2eTargetDatabaseUrl(process.env.DATABASE_URL!);
  const inventory = await routes();
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  databaseUrl.username = `ux_fault_${randomBytes(8).toString("hex")}`;
  databaseUrl.password = "invalid-isolated-fixture";
  const server = startSpawnedProcess({ executable: process.execPath, args: [resolveNextCliPath(), "start", "--hostname", "localhost", "--port", "3101"], env: { ...process.env, DATABASE_URL: databaseUrl.href, APP_BASE_URL: "http://localhost:3101" } });
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  const token = randomBytes(32).toString("base64url");
  await context.addCookies(["admin_session", "customer_session"].map(name => ({ name, value: token, url: "http://localhost:3101", httpOnly: true, sameSite: "Lax" as const })));
  const records: Record<string, unknown>[] = [];
  try {
    await waitForHttpServerReady("http://localhost:3101/api/health/live", server);
    for (const entry of inventory.pages) {
      await page.goto(`http://localhost:3101${target(entry.route)}`);
      await expect(page.getByRole("heading", { name: "暫時無法載入這個頁面" })).toBeVisible();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("避免重複付款");
      await expect(page.locator("body")).not.toContainText(/Prisma|DATABASE_URL|invalid-isolated-fixture|password authentication failed/);
      await expect(page.getByRole("button", { name: "重新載入", exact: true })).toBeEnabled();
      const screenshot = `error-${entry.route.replaceAll(/[^a-z0-9]/gi, "-") || "home"}-390.png`;
      await page.screenshot({ path: info.outputPath(screenshot), fullPage: true, animations: "disabled" });
      records.push({ route: entry.route, state: "error", width: 390, screenshot });
    }
    const requests: string[] = [];
    page.on("request", request => requests.push(request.url()));
    await page.getByRole("button", { name: "重新載入", exact: true }).click();
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("避免重複付款");
  } finally {
    await context.close();
    await server.stop(); await waitForServerExit(server);
    await writeFile(info.outputPath("error-results.json"), JSON.stringify({ sourceDigest: inventory.sourceDigest, records }, null, 2));
  }
});
