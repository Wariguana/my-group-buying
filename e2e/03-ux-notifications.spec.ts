import { test, expect } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { validateE2eTargetDatabaseUrl } from "../scripts/lib/e2e-database";
import { startSpawnedProcess, waitForHttpServerReady, waitForServerExit, resolveNextCliPath } from "../scripts/lib/e2e-runner";

test("notification verification, consent withdrawal, safe retry and retry limit use isolated provider data", async ({ page }, info) => {
  test.setTimeout(90000); page.setDefaultTimeout(15000);
  validateE2eTargetDatabaseUrl(process.env.DATABASE_URL!);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const server = startSpawnedProcess({ executable: process.execPath, args: [resolveNextCliPath(), "start", "--hostname", "localhost", "--port", "3101"], env: { ...process.env, APP_BASE_URL: "http://localhost:3101", LINE_LOGIN_PROVIDER_ID: "ux-isolated-provider", LINE_MESSAGING_PROVIDER_ID: "ux-isolated-provider", LINE_MESSAGING_ENABLED: "false", QBUY_ENABLE_LINE_PUSH: "false" } });
  page.on("dialog", dialog => dialog.accept());
  try {
    await waitForHttpServerReady("http://localhost:3101/api/health/live", server);
    const account = await db.customerAccount.create({ data: { lineUserId: `U${randomBytes(16).toString("hex")}`, displayName: "UX 通知對象", lastLoginAt: new Date() } });
    const purchase = await db.checkout.create({ data: { customerAccountId: account.id, requestId: randomUUID(), requestHash: "a".repeat(64), customerName: "UX 通知驗收", customerPhone: "0912345678", delivery: {}, bankSnapshot: {}, subtotal: 0, shippingAmount: 0, totalAmount: 0, expiresAt: new Date(Date.now() + 3600000) } });
    const retry = await db.checkoutOutbox.create({ data: { checkoutId: purchase.id, event: "UX_NOTIFICATION", audience: "CUSTOMER", payload: {}, status: "RETRY", attempts: 1 } });
    const exhausted = await db.checkoutOutbox.create({ data: { checkoutId: purchase.id, event: "UX_EXHAUSTED", audience: "CUSTOMER", payload: {}, status: "RETRY", attempts: 8 } });
    await page.goto("http://localhost:3101/admin/login");
    await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
    await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "登入", exact: true }).click(); await expect(page).toHaveURL(/\/admin$/);
    await page.goto("http://localhost:3101/admin/qbuy?queue=all&q=UX%20通知驗收");
    await page.getByText("LINE 通知對象人工驗證", { exact: true }).click();
    const recipient = page.getByRole("form", { name: "記錄已核實通知對象" });
    await recipient.getByLabel("顧客 UUID（與 Admin 擇一）", { exact: true }).fill(account.id);
    await recipient.getByLabel("Messaging 使用者 ID", { exact: true }).fill(account.lineUserId);
    await recipient.getByLabel("已核實 provider ID", { exact: true }).fill("ux-wrong-provider");
    await recipient.getByLabel("身分、同意與可推播資格核實依據", { exact: true }).fill("隔離測試已模擬確認身分與同意，無真實推播");
    await recipient.getByRole("button").click(); await expect(recipient.getByRole("alert")).toContainText("provider 尚未設定或不符");
    expect(await db.lineRecipient.count({ where: { customerAccountId: account.id } })).toBe(0);
    await recipient.getByLabel("已核實 provider ID", { exact: true }).fill("ux-isolated-provider");
    await recipient.getByRole("button").click(); await expect(recipient.getByRole("status")).toContainText("操作已完成");
    const disable = page.getByRole("form", { name: "停用此通知對象" });
    await disable.getByLabel("停用／撤回同意依據", { exact: true }).fill("隔離測試模擬撤回同意");
    await disable.getByRole("button").click(); await expect(page.getByText(/通知已停用/)).toBeVisible();
    expect((await db.lineRecipient.findUniqueOrThrow({ where: { customerAccountId: account.id } })).enabled).toBe(false);
    await page.getByText("通知狀態與重試", { exact: true }).click();
    for (const [event, expected] of [["UX_NOTIFICATION", "success"], ["UX_EXHAUSTED", "failure"]]) {
      const row = page.getByText(new RegExp(`^${event} ·`)).locator("..");
      await row.getByRole("button", { name: "排入安全重試", exact: true }).click();
      if (expected === "success") await expect(row.getByRole("button", { name: "排入安全重試", exact: true })).toHaveCount(0);
      else await expect(row.getByRole("alert")).toContainText("已超過安全重試期限或次數");
    }
    expect((await db.checkoutOutbox.findUniqueOrThrow({ where: { id: retry.id } })).status).toBe("PENDING");
    expect((await db.checkoutOutbox.findUniqueOrThrow({ where: { id: exhausted.id } })).status).toBe("RETRY");
    expect(await db.notificationDelivery.count({ where: { outboxId: { in: [retry.id, exhausted.id] } } })).toBe(0);
    await page.screenshot({ path: info.outputPath("notifications-manual-verification-and-retry.png"), fullPage: true });
  } finally { await db.$disconnect(); await server.stop(); await waitForServerExit(server); }
});
