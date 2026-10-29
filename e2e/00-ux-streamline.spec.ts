import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { validateE2eTargetDatabaseUrl } from "../scripts/lib/e2e-database";
import { inspectUi } from "./helpers/ui-consistency";
import { captureResponsive } from "./helpers/capture-responsive";

test("streamlined empty shopping, grouped menu and settings deep link remain reachable at five widths", async ({ page }, info) => {
  test.setTimeout(120000);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "購物車", exact: true })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "我的訂單", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "精選開團" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "清除篩選條件" })).toHaveCount(0);
    await inspectUi(page);
    await page.goto("/cart");
    const main = page.getByRole("main");
    await expect(main.getByText("購物車目前沒有商品。", { exact: true })).toBeVisible();
    await expect(main.getByRole("status")).toHaveCount(0);
    await expect(main.getByRole("button")).toHaveCount(0);
    await expect(main.getByRole("link")).toHaveCount(1);
    await main.getByRole("link", { name: "繼續購物" }).press("Enter");
    await expect(page).toHaveURL("/");
  }
  await page.goto("/admin/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const toggle = page.getByRole("button", { name: /管理選單/ });
    if (width < 1024) { await toggle.press("Enter"); await expect(toggle).toHaveAttribute("aria-expanded", "true"); }
    const nav = page.getByRole("navigation", { name: "管理後台導覽" });
    await expect(nav.getByRole("link")).toHaveCount(11);
    await expect(nav.getByRole("link").first()).toHaveText("營運首頁");
    await expect(nav.getByRole("link").last()).toHaveText("平台監控");
    await inspectUi(page);
    if ([390, 1440].includes(width)) await page.screenshot({ path: info.outputPath(`grouped-admin-menu-${width}.png`), fullPage: true });
    await nav.getByRole("link", { name: "銀行與配送設定", exact: true }).press("Enter");
    await expect(page).toHaveURL(/settings=1#settings$/);
    await expect(page.locator("#settings")).toHaveAttribute("open", "");
    await expect(page.getByRole("button", { name: "儲存銀行設定", exact: true })).toBeVisible();
    await inspectUi(page);
    if (width < 1024) await expect(page.getByRole("button", { name: "開啟管理選單" })).toHaveAttribute("aria-expanded", "false");
    await page.goto("/admin");
  }
});

test("monitoring distinguishes healthy, missing, never run, stale, failed and real read failure", async ({ page }, info) => {
  test.setTimeout(180000);
  validateE2eTargetDatabaseUrl(process.env.DATABASE_URL!);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const lock = new Client({ connectionString: process.env.DATABASE_URL!, connectionTimeoutMillis: 3000 });
  const records: { state: string; result: string }[] = [];
  await lock.connect();
  try {
    expect(await db.workerHeartbeat.count()).toBe(0);
    await page.goto("/admin/login");
    await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
    await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "登入", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    for (const name of ["checkouts", "notifications"]) await db.workerHeartbeat.create({ data: { name, lastSuccessAt: new Date() } });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await page.goto("/admin/operations");
      await expect(page.getByRole("status")).toContainText("關鍵系統檢查正常");
      await expect(page.getByRole("link", { name: "前往處理" })).toHaveCount(0);
      await expect(page.locator("main details")).not.toHaveAttribute("open");
      await inspectUi(page, { expandDetails: false });
    }
    await captureResponsive(page, info, "monitoring-normal");
    await page.getByText("詳細技術診斷", { exact: false }).press("Enter");
    await expect(page.getByRole("definition")).toHaveCount(11);
    await captureResponsive(page, info, "monitoring-diagnostics");
    records.push({ state: "normal", result: "all 11 metrics retained; diagnostics collapsed by default" });
    for (const [state, patch, label] of [
      ["never-run", { lastSuccessAt: null, lastError: null }, "未執行（無成功紀錄）"],
      ["stale", { lastSuccessAt: new Date(Date.now() - 240000), lastError: null }, "已失聯（超過 3 分鐘）"],
      ["failed", { lastSuccessAt: new Date(), lastError: "WORKER_FAILED" }, "執行失敗"],
    ] as const) {
      await db.workerHeartbeat.update({ where: { name: "checkouts" }, data: patch });
      await page.goto("/admin/operations");
      await expect(page.getByRole("status")).toContainText("需要處理關鍵異常");
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
      await expect(page.getByText(/不能據此判定系統正常/)).toBeVisible();
      await captureResponsive(page, info, `monitoring-${state}`);
      records.push({ state, result: label });
    }
    await db.workerHeartbeat.delete({ where: { name: "checkouts" } });
    await page.goto("/admin/operations");
    await expect(page.getByText("無資料（未回報心跳）", { exact: true }).first()).toBeVisible();
    await captureResponsive(page, info, "monitoring-no-data");
    await db.workerHeartbeat.create({ data: { name: "checkouts", lastSuccessAt: new Date() } });
    const customer = await db.customerAccount.create({ data: { lineUserId: randomUUID(), lastLoginAt: new Date() } });
    await db.checkout.create({ data: { customerAccountId: customer.id, requestId: randomUUID(), requestHash: "a".repeat(64), customerName: "隔離監控逾期案件", customerPhone: "0912345678", delivery: {}, bankSnapshot: {}, subtotal: 0, shippingAmount: 0, totalAmount: 0, expiresAt: new Date(Date.now() - 300000) } });
    await page.goto("/admin/operations");
    await expect(page.getByRole("status")).toContainText("需要處理關鍵異常");
    await expect(page.getByRole("region", { name: "實際異常與待辦" }).getByRole("link", { name: "前往處理" })).toHaveCount(1);
    await captureResponsive(page, info, "monitoring-anomaly");
    await lock.query("BEGIN");
    await lock.query('LOCK TABLE "WorkerHeartbeat" IN ACCESS EXCLUSIVE MODE');
    await page.goto("/admin/operations", { timeout: 45000 });
    await expect(page.getByRole("main").getByRole("alert")).toContainText("監控資料讀取失敗，系統狀態未知");
    await expect(page.getByText("關鍵系統檢查正常", { exact: false })).toHaveCount(0);
    await captureResponsive(page, info, "monitoring-read-failure");
    await lock.query("ROLLBACK");
    await page.getByRole("link", { name: "重新載入監控" }).click();
    await expect(page.getByRole("heading", { name: "系統健康摘要" })).toBeVisible();
    records.push({ state: "read-failure", result: "real isolated table lock timeout, unknown shown, retry recovered" });
  } finally {
    await lock.query("ROLLBACK").catch(() => undefined); await lock.end();
    await db.workerHeartbeat.deleteMany({ where: { name: { in: ["checkouts", "notifications"] } } });
    await db.$disconnect();
    await writeFile(info.outputPath("monitoring-state-results.json"), JSON.stringify(records, null, 2));
  }
});
