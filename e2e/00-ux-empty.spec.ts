import { test, expect } from "@playwright/test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { validateE2eTargetDatabaseUrl } from "../scripts/lib/e2e-database";

test("first-run empty states and unavailable shipping remain usable at all seven widths", async ({ page, context }, info) => {
  test.setTimeout(180000);
  validateE2eTargetDatabaseUrl(process.env.DATABASE_URL!);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const records: Record<string, unknown>[] = [];
  try {
    expect(await db.checkout.count()).toBe(0);
    expect(await db.groupBuy.count()).toBe(0);
    const account = await db.customerAccount.create({ data: { lineUserId: randomUUID(), displayName: "空資料驗收", lastLoginAt: new Date() } });
    const token = randomBytes(32).toString("base64url");
    await db.customerSession.create({ data: { customerAccountId: account.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
    await context.addCookies([{ name: "customer_session", value: token, url: "http://localhost:3100", httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/admin/login");
    await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
    await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "登入", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    for (const route of ["/", "/cart", "/checkout", "/my/orders", "/admin", "/admin/commerce", "/admin/payments", "/admin/qbuy", "/admin/products", "/admin/group-buys", "/admin/suppliers", "/admin/pickup-locations", "/admin/orders", "/admin/operations", "/missing-ux-page"]) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(route === "/missing-ux-page" ? 404 : 200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      if (route === "/cart") await expect(page.getByText("購物車目前沒有商品。", { exact: false })).toBeVisible();
      if (route === "/checkout") {
        await expect(page.getByText("尚未設定可用配送能力，請聯絡客服。", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "計算配送與總額", exact: true })).toBeDisabled();
      }
      for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect.soft(scrollWidth, `${route}: empty ${width}`).toBeLessThanOrEqual(width);
        const screenshot = `empty-${route.replaceAll(/[^a-z0-9]/gi, "-") || "home"}-${width}.png`;
        if ([320, 390, 768, 1440].includes(width)) await page.screenshot({ path: info.outputPath(screenshot), fullPage: true, animations: "disabled" });
        records.push({ route, state: route === "/missing-ux-page" ? "not-found" : "empty", width, scrollWidth, screenshot: [320, 390, 768, 1440].includes(width) ? screenshot : null });
      }
    }
  } finally {
    await writeFile(info.outputPath("empty-results.json"), JSON.stringify(records, null, 2));
    await db.$disconnect();
  }
});
