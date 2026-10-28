import { test, expect } from "@playwright/test";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { validateE2eTargetDatabaseUrl } from "../scripts/lib/e2e-database";

for (const width of [390, 768, 1440]) {
  test(`customer purchase and admin responsive workflow at ${width}px`, async ({ browser }, info) => {
    test.setTimeout(90000);
    validateE2eTargetDatabaseUrl(process.env.DATABASE_URL!);
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: "America/Los_Angeles" });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", d => d.accept());
    const suffix = randomUUID();
    try {
      const customer = await db.customerAccount.create({ data: { lineUserId: suffix, displayName: "測試顧客很長的顯示名稱".repeat(6), lastLoginAt: new Date() } });
      const token = randomBytes(32).toString("base64url");
      await db.customerSession.create({ data: { customerAccountId: customer.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
      await context.addCookies([{ name: "customer_session", value: token, url: "http://localhost:3100", httpOnly: true, sameSite: "Lax" }]);
      await db.checkoutSettings.upsert({ where: { id: "default" }, create: { id: "default", bankName: "隔離銀行", bankCode: "000", bankAccount: "00000000", accountName: "合成測試", enabled: true }, update: { enabled: true } });
      await db.shippingRate.upsert({ where: { method_temperature: { method: "HOME_DELIVERY", temperature: "AMBIENT" } }, create: { method: "HOME_DELIVERY", temperature: "AMBIENT", enabled: true, fee: 60, freeThreshold: 500, maxWeightGrams: 100000, maxLengthMm: 1000, maxWidthMm: 1000, maxHeightMm: 1000, capabilityEvidence: "合成隔離測試" }, update: { enabled: true, fee: 60, freeThreshold: 500 } });
      const category = await db.category.create({ data: { name: `響應測試-${suffix}` } });
      const product = await db.product.create({ data: { name: `手機商品-${suffix}`, defaultPrice: 299, cost: 100, unit: "件", skuInventoryEnabled: true } });
      await db.productSku.create({ data: { id: product.id, productId: product.id, code: `DEFAULT-${product.id.toUpperCase()}`, combinationKey: "default", shippingMethods: ["HOME_DELIVERY"], weightGrams: 10, lengthMm: 10, widthMm: 10, heightMm: 10, inventory: { create: { onHand: 20 } } } });
      const slugs: string[] = [];
      for (let index = 0; index < 2; index++) {
        const group = await db.groupBuy.create({ data: { title: `響應-${suffix}-${index} 商品說明及較長文字測試`, slug: `gb-${randomBytes(12).toString("base64url")}`, categoryId: category.id, status: "PUBLISHED", startAt: new Date(Date.now() - 3600000), endAt: new Date(Date.now() + 3600000), allowsCombinedShipping: false } });
        await db.groupBuySku.create({ data: { groupBuyId: group.id, skuId: product.id, salePrice: 299 } });
        slugs.push(group.slug);
      }
      const noOverflow = async () => {
        const layout = await page.evaluate(() => ({ path: location.pathname, width: innerWidth, scroll: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll("main *")].filter(e => e.getBoundingClientRect().right > innerWidth).slice(0, 12).map(e => ({ tag: e.tagName, class: e.className, right: Math.round(e.getBoundingClientRect().right) })) }));
        expect(layout.scroll, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width);
      };
      await page.goto(`/?q=${encodeURIComponent(suffix)}&category=${category.id}`);
      await expect(page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "查看團購" }) })).toHaveCount(2);
      await noOverflow();
      await page.getByRole("navigation", { name: "商城導航" }).getByRole("link", { name: "已結束", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`category=${category.id}`));
      await expect(page.getByLabel("搜尋商品")).toHaveValue(suffix);
      await expect(page.getByText("目前沒有符合條件的團購。", { exact: true })).toBeVisible();
      for (const slug of slugs) {
        await page.goto(`/group-buys/${slug}`);
        await page.getByRole("button", { name: "加入購物車", exact: true }).click();
        await expect(page.getByRole("status")).toContainText("已加入購物車");
        await noOverflow();
      }
      expect((await db.skuInventory.findUniqueOrThrow({ where: { skuId: product.id } })).reserved).toBe(0);
      await page.goto("/cart");
      await expect(page.getByText("有效商品小計 NT$598", { exact: true })).toBeVisible();
      await noOverflow();
      await page.getByRole("link", { name: "前往跨團結帳", exact: true }).click();
      await page.getByLabel("收件人姓名", { exact: true }).fill("響應驗收顧客");
      await page.getByLabel("手機", { exact: true }).fill("0912345678");
      await page.getByLabel("配送方式", { exact: true }).selectOption("HOME_DELIVERY");
      await page.getByLabel("宅配地址", { exact: true }).fill("台北市隔離測試區測試路 1 號");
      await page.getByLabel("宅配地址", { exact: true }).press("Enter");
      const quote = page.getByRole("region", { name: "配送報價明細" });
      await expect(quote.getByText("本組商品 NT$299 · 本組運費 NT$60", { exact: true })).toHaveCount(2);
      await expect(quote.getByRole("status")).toHaveText("商品 NT$598＋運費 NT$120＝應付 NT$718");
      await noOverflow();
      await page.screenshot({ path: info.outputPath(`quote-${width}.png`), fullPage: true });
      let creates = 0;
      await page.route("**/api/checkout", async route => { if (route.request().postDataJSON().operation === "create") { creates++; await new Promise(resolve => setTimeout(resolve, 350)); } await route.continue(); });
      await page.getByRole("button", { name: "確認金額並前往付款", exact: true }).dblclick();
      await expect(page).toHaveURL(/\/checkout\/[a-f0-9-]+$/);
      expect(creates).toBe(1);
      expect(await db.checkout.count({ where: { customerAccountId: customer.id } })).toBe(1);
      expect((await db.skuInventory.findUniqueOrThrow({ where: { skuId: product.id } })).reserved).toBe(2);
      await page.reload();
      await expect(page.getByRole("heading", { name: "本次購買", exact: true })).toBeVisible();
      await noOverflow();
      await page.screenshot({ path: info.outputPath(`payment-${width}.png`), fullPage: true });
      await page.goBack();
      await expect(page.getByRole("heading", { name: "跨團結帳", exact: true })).toBeVisible();
      await expect(page.getByText("購物車目前沒有商品。", { exact: false })).toBeVisible();
      expect(await db.checkout.count({ where: { customerAccountId: customer.id } })).toBe(1);
      await page.goForward();
      await expect(page.getByRole("heading", { name: "本次購買", exact: true })).toBeVisible();
      await page.goto("/admin/login");
      await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
      await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
      await page.getByRole("button", { name: "登入", exact: true }).click();
      await expect(page).toHaveURL(/\/admin$/);
      for (const path of ["/admin", "/admin/commerce", "/admin/payments?view=all", "/admin/qbuy?queue=all"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await noOverflow();
      }
      await page.screenshot({ path: info.outputPath(`admin-${width}.png`), fullPage: true });
      expect(errors).toEqual([]);
    } catch (error) { await page.screenshot({ path: info.outputPath(`failure-${width}.png`), fullPage: true }).catch(() => undefined); throw error; } finally { await context.close(); await db.$disconnect(); }
  });
}
