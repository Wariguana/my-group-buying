import { test, expect } from "@playwright/test";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { validateE2eTargetDatabaseUrl } from "../scripts/lib/e2e-database";
import { auditUiSource } from "../scripts/lib/ui-consistency";
import { inspectUi, inspectButtonStates } from "./helpers/ui-consistency";

for (const width of [390, 768, 1440]) {
  test(`customer purchase and admin responsive workflow at ${width}px`, async ({ browser }, info) => {
    test.setTimeout(240000);
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
        await inspectUi(page);
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
      const checkoutPath = new URL(page.url()).pathname;
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
      const loginReport = await inspectUi(page);
      await page.screenshot({ path: info.outputPath(`page--admin-login-${width}.png`), fullPage: true });
      await inspectButtonStates(page);
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

      // Cover every page route, including CRUD editors and the legacy order flow.
      // All fixture writes remain inside the runner's disposable E2E database.
      const supplier = await db.supplier.create({ data: { name: `一致性供應商 ${suffix}` } });
      const legacyProduct = await db.product.create({ data: { name: `一致性單品 ${suffix}`, defaultPrice: 100, cost: 20, unit: "件", supplierId: supplier.id } });
      const pickup = await db.pickupLocation.create({ data: { name: `一致性取貨點 ${suffix}`, address: "臺北市隔離測試路一號" } });
      const legacy = await db.groupBuy.create({ data: {
        title: `一致性單品團 ${suffix}`, slug: `gb-${randomBytes(12).toString("base64url")}`, status: "PUBLISHED",
        startAt: new Date(Date.now() - 3600000), endAt: new Date(Date.now() + 3600000), allowsSevenEleven: true,
        items: { create: { productId: legacyProduct.id, salePrice: 100, cost: 20, stock: 10, sortOrder: 0 } },
        pickups: { create: { pickupLocationId: pickup.id, sortOrder: 0 } },
        images: { create: [0, 1].map(sortOrder => ({ imageUrl: sortOrder ? "/window.svg" : "/file.svg", sortOrder })) },
      }, include: { items: true, pickups: true } });
      const draft = await db.groupBuy.create({ data: { title: `一致性草稿 ${suffix}`, slug: `gb-${randomBytes(12).toString("base64url")}`, startAt: new Date(Date.now() - 3600000), endAt: new Date(Date.now() + 3600000),
        images: { create: [0, 1].map(sortOrder => ({ imageUrl: sortOrder ? "/window.svg" : "/file.svg", sortOrder })) },
        items: { create: { productId: legacyProduct.id, salePrice: 100, cost: 20, sortOrder: 0 } },
        pickups: { create: { pickupLocationId: pickup.id, sortOrder: 0 } },
      } });
      const legacyCustomer = await db.customer.create({ data: { phone: `09${randomBytes(4).readUInt32BE().toString().padStart(10, "0").slice(0, 8)}` } });
      const legacyOrder = await db.order.create({ data: {
        publicCode: `ord-${randomBytes(12).toString("base64url")}`, orderNumber: `20991231${String(width).padStart(4, "0")}`,
        groupBuyId: legacy.id, customerId: legacyCustomer.id, customerAccountId: customer.id, groupBuyPickupId: legacy.pickups[0].id,
        status: "PLACED", customerName: "一致性測試顧客", customerPhone: legacyCustomer.phone, pickupName: pickup.name, pickupAddress: pickup.address, totalAmount: 100,
        items: { create: { groupBuyItemId: legacy.items[0].id, productName: legacyProduct.name, unit: "件", unitPrice: 100, quantity: 1 } },
      } });
      const routes = auditUiSource().routes;
      const actual: Record<string, string> = {
        "/group-buys/[slug]": `/group-buys/${legacy.slug}`,
        "/orders/[publicCode]": `/orders/${legacyOrder.publicCode}`,
        "/checkout/[id]": checkoutPath,
        "/my/orders/[checkoutId]": `/my/orders/${checkoutPath.split("/").at(-1)}`,
        "/admin/orders/[publicCode]": `/admin/orders/${legacyOrder.publicCode}`,
        "/admin/products/[id]/edit": `/admin/products/${legacyProduct.id}/edit`,
        "/admin/suppliers/[id]/edit": `/admin/suppliers/${supplier.id}/edit`,
        "/admin/pickup-locations/[id]/edit": `/admin/pickup-locations/${pickup.id}/edit`,
        "/admin/group-buys/[id]/edit": `/admin/group-buys/${draft.id}/edit`,
        "/admin/inventory/[skuId]": `/admin/inventory/${product.id}`,
      };
      const census: Awaited<ReturnType<typeof inspectUi>>[] = [loginReport];
      const visited = new Set(["/admin/login"]);
      for (const route of routes.filter(route => route !== "/admin/login")) {
        const target = actual[route] ?? route;
        expect(target, `Missing route fixture: ${route}`).not.toContain("[");
        await page.goto(target);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(new URL(page.url()).pathname, `${route} must render instead of redirecting`).toBe(target.split("?")[0]);
        census.push(await inspectUi(page));
        visited.add(route);
        await page.screenshot({ path: info.outputPath(`page-${route === "/" ? "home" : route.replaceAll(/[^a-z0-9]+/gi, "-")}-${width}.png`), fullPage: true });
      }
      expect([...visited].sort()).toEqual(routes);
      for (const target of [`/admin/commerce?product=${product.id}`, `/admin/commerce?group=${legacy.id}`, "/admin/payments?view=all", "/admin/qbuy?queue=all", "/my/orders?q=does-not-exist", `/orders/ord-${randomBytes(12).toString("base64url")}`, "/missing-ui-audit-page"]) {
        await page.goto(target);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        census.push(await inspectUi(page));
      }
      // Exercise the standardized gallery, radio choices and keyboard submit.
      await page.goto(`/group-buys/${legacy.slug}`);
      await page.getByRole("button", { name: "下一張圖片", exact: true }).click();
      await expect(page.getByRole("button", { name: `顯示${legacy.title}圖片 2` })).toHaveAttribute("aria-current", "true");
      await page.getByRole("button", { name: "上一張圖片", exact: true }).click();
      await page.getByRole("radio", { name: "7-ELEVEN 門市取貨", exact: true }).check();
      await expect(page.getByRole("button", { name: "選擇 7-ELEVEN 門市", exact: true })).toBeVisible();
      await page.getByRole("radio", { name: "自取", exact: true }).check();
      await page.getByLabel(`${legacyProduct.name}數量`, { exact: true }).fill("1");
      await page.getByLabel("訂購人姓名", { exact: true }).fill("一致性鍵盤訂購");
      await page.getByLabel("手機號碼", { exact: true }).fill("0912345678");
      await inspectUi(page);
      await page.getByRole("button", { name: "送出訂單", exact: true }).filter({ visible: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "訂購成功", exact: true })).toBeVisible();
      await inspectUi(page);
      const censusPath = info.outputPath(`ui-census-${width}.json`);
      writeFileSync(censusPath, JSON.stringify({ routes: [...visited].sort(), census }, null, 2));
      await info.attach(`ui-census-${width}`, { path: censusPath, contentType: "application/json" });
      expect(errors).toEqual([]);
    } catch (error) { await page.screenshot({ path: info.outputPath(`failure-${width}.png`), fullPage: true }).catch(() => undefined); throw error; } finally { await context.close(); await db.$disconnect(); }
  });
}
