import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { validateE2eTargetDatabaseUrl } from "../scripts/lib/e2e-database";
import { textContrastIssues } from "./lib/contrast";
import sharp from "sharp";
import { syntheticBankReference } from "./lib/reference";

const origin = "http://localhost:3100";
async function session(db: PrismaClient, context: BrowserContext, accountId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.customerSession.create({ data: { customerAccountId: accountId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
  await context.addCookies([{ name: "customer_session", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
}
async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
async function fixture(db: PrismaClient, onHand = 20) {
  const account = await db.customerAccount.create({ data: { lineUserId: randomUUID(), displayName: "七尺寸驗收顧客", lastLoginAt: new Date() } });
  const supplier = await db.supplier.create({ data: { name: "UX 驗收供應商" } });
  const pickup = await db.pickupLocation.create({ data: { name: "UX 驗收取貨地點", address: "臺北市測試區安心路 1 號" } });
  const product = await db.product.create({ data: { name: "UX 七尺寸驗收商品", defaultPrice: 299, cost: 100, unit: "件", supplierId: supplier.id, skuInventoryEnabled: true } });
  const sku = await db.productSku.create({ data: { id: product.id, productId: product.id, code: `DEFAULT-${product.id.toUpperCase()}`, combinationKey: "default", weightGrams: 10, lengthMm: 10, widthMm: 10, heightMm: 10, shippingMethods: ["HOME_DELIVERY", "SEVEN_ELEVEN"], inventory: { create: { onHand } } } });
  const group = await db.groupBuy.create({ data: { title: "UX 七尺寸驗收開團", slug: `gb-${randomBytes(12).toString("base64url")}`, status: "PUBLISHED", startAt: new Date(Date.now() - 3600000), endAt: new Date(Date.now() + 86400000), allowsSevenEleven: true } });
  const offer = await db.groupBuySku.create({ data: { groupBuyId: group.id, skuId: sku.id, salePrice: 299, purchaseLimit: 3 } });
  await db.checkoutSettings.upsert({ where: { id: "default" }, create: { id: "default", bankName: "隔離測試銀行", bankCode: "000", bankAccount: "00000000", accountName: "UX 合成測試", enabled: true }, update: { enabled: true } });
  for (const method of ["HOME_DELIVERY", "SEVEN_ELEVEN"]) await db.shippingRate.upsert({ where: { method_temperature: { method, temperature: "AMBIENT" } }, create: { method, temperature: "AMBIENT", enabled: true, fee: 60, maxWeightGrams: 100000, maxLengthMm: 1000, maxWidthMm: 1000, maxHeightMm: 1000, capabilityEvidence: "隔離合成驗收" }, update: { enabled: true } });
  const groupPickup = await db.groupBuyPickup.create({ data: { groupBuyId: group.id, pickupLocationId: pickup.id, pickupStartAt: new Date(Date.now() + 172800000), pickupEndAt: new Date(Date.now() + 259200000) } });
  const legacyCustomer = await db.customer.create({ data: { phone: `09${Date.now().toString().slice(-8)}` } });
  const order = await db.order.create({ data: { publicCode: `ord-${randomBytes(12).toString("base64url")}`, orderNumber: Date.now().toString().slice(-12), groupBuyId: group.id, customerId: legacyCustomer.id, customerAccountId: account.id, groupBuyPickupId: groupPickup.id, status: "PLACED", customerName: "UX 歷史訂單顧客", customerPhone: legacyCustomer.phone, totalAmount: 0, pickupName: pickup.name, pickupAddress: pickup.address } });
  return { account, supplier, pickup, product, sku, group, offer, order };
}

test("7-ELEVEN checkout round trip preserves recipient and creates exactly one purchase", async ({ page, context, browser }, info) => {
  test.setTimeout(90000);
  validateE2eTargetDatabaseUrl(process.env.DATABASE_URL!);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const f = await fixture(db);
    const fallbackContext = await browser.newContext({ javaScriptEnabled: false });
    try {
      const fallbackPage = await fallbackContext.newPage(); await fallbackPage.goto("/");
      const bridge = await fallbackPage.request.post("/api/logistics/ecpay/store-map/start?flow=checkout", { headers: { origin }, form: { groupBuySlug: f.group.slug } });
      expect(bridge.status()).toBe(200);
      await fallbackPage.setContent(await bridge.text());
      await fallbackPage.getByRole("button", { name: "繼續選擇門市", exact: true }).press("Enter");
      await expect(fallbackPage.getByRole("heading", { name: "7-ELEVEN 測試門市", exact: true })).toBeVisible();
    } finally { await fallbackContext.close(); }
    await session(db, context, f.account.id);
    await page.goto(`/group-buys/${f.group.slug}`);
    await expect(page.getByRole("heading", { name: "選擇商品規格", exact: true })).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(f.sku.code);
    await page.getByRole("button", { name: "加入購物車", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("已加入購物車");
    await page.goto("/checkout");
    await page.getByLabel("收件人姓名", { exact: true }).fill("選店返回驗收顧客");
    await page.getByLabel("手機", { exact: true }).fill("0912345678");
    await page.getByLabel("配送方式", { exact: true }).selectOption("SEVEN_ELEVEN");
    await expect(page.getByRole("button", { name: "計算配送與總額", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "選擇 7-ELEVEN 門市", exact: true }).click();
    await page.getByRole("button", { name: "選擇測試 7-ELEVEN 門市", exact: true }).click();
    await expect(page).toHaveURL(/\/checkout\?selectionToken=/);
    await expect(page.getByLabel("收件人姓名", { exact: true })).toHaveValue("選店返回驗收顧客");
    await expect(page.getByLabel("手機", { exact: true })).toHaveValue("0912345678");
    await expect(page.getByLabel("配送方式", { exact: true })).toHaveValue("SEVEN_ELEVEN");
    await page.getByRole("button", { name: "計算配送與總額", exact: true }).click();
    await expect(page.getByRole("region", { name: "配送報價明細" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("seven-checkout-quote.png"), fullPage: true });
    await page.getByRole("button", { name: "確認金額並前往付款", exact: true }).click();
    await expect(page).toHaveURL(/\/checkout\/[a-f0-9-]+$/);
    const purchase = await db.checkout.findFirstOrThrow({ where: { customerAccountId: f.account.id } });
    expect(purchase.delivery).toMatchObject({ storeId: "991234" });
    expect(await db.checkout.count({ where: { customerAccountId: f.account.id } })).toBe(1);
    expect((await db.skuInventory.findUniqueOrThrow({ where: { skuId: f.sku.id } })).reserved).toBe(1);
    expect(await page.evaluate(id => sessionStorage.getItem(`qbuy-checkout-store-draft:${id}`), f.account.id)).toBeNull();
  } finally { await db.$disconnect(); }
});

test("cart synchronizes between tabs and recovers explicitly from corrupt storage", async ({ page, context }) => {
  validateE2eTargetDatabaseUrl(process.env.DATABASE_URL!);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const f = await fixture(db);
    await page.goto(`/group-buys/${f.group.slug}`);
    await page.getByRole("button", { name: "加入購物車", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("已加入購物車");
    const other = await context.newPage(); await other.goto("/cart");
    await expect(other.getByText("有效商品小計 NT$299", { exact: true })).toBeVisible();
    await page.goto("/cart");
    await page.getByRole("article").getByRole("spinbutton").fill("2");
    await expect(other.getByText("有效商品小計 NT$598", { exact: true })).toBeVisible();
    await page.evaluate(() => localStorage.setItem("qbuy.cart.v1", "corrupt-json"));
    await expect(other.getByRole("main").getByRole("alert")).toContainText("購物車資料損毀");
    await expect(other.getByRole("link", { name: "前往跨團結帳", exact: true })).toHaveCount(0);
    other.once("dialog", dialog => dialog.accept());
    await other.getByRole("button", { name: "清除無效購物車", exact: true }).click();
    await expect(other.getByText("購物車目前沒有商品。", { exact: false })).toBeVisible();
    await expect(page.getByText("購物車目前沒有商品。", { exact: false })).toBeVisible();
    await other.close();
  } finally { await db.$disconnect(); }
});

test("lost checkout acknowledgement can be retried without a second purchase or stock reservation", async ({ page, context }, info) => {
  test.setTimeout(90000);
  validateE2eTargetDatabaseUrl(process.env.DATABASE_URL!);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const f = await fixture(db); await session(db, context, f.account.id);
    await page.goto(`/group-buys/${f.group.slug}`);
    await page.getByRole("button", { name: "加入購物車", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("已加入購物車");
    await page.goto("/checkout");
    await page.getByLabel("收件人姓名", { exact: true }).fill("斷線重試顧客");
    await page.getByLabel("手機", { exact: true }).fill("0912345678");
    await page.getByLabel("配送方式", { exact: true }).selectOption("HOME_DELIVERY");
    await page.getByLabel("宅配地址", { exact: true }).fill("臺北市測試區安心路 1 號");
    await page.getByRole("button", { name: "計算配送與總額", exact: true }).click();
    await page.route("**/api/checkout", async route => {
      if (route.request().postDataJSON().operation === "create") { const response = await route.fetch(); expect(response.ok()).toBe(true); await route.abort("failed"); }
      else await route.continue();
    });
    await page.getByRole("button", { name: "確認金額並前往付款", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("目前無法連線");
    expect(await db.checkout.count({ where: { customerAccountId: f.account.id } })).toBe(1);
    expect((await db.skuInventory.findUniqueOrThrow({ where: { skuId: f.sku.id } })).reserved).toBe(1);
    await page.screenshot({ path: info.outputPath("checkout-ambiguous-network-390.png"), fullPage: true });
    await page.unroute("**/api/checkout");
    await page.getByRole("button", { name: "計算配送與總額", exact: true }).click();
    // The authoritative idempotency lookup also recovers an existing purchase on quote.
    await expect(page).toHaveURL(/\/checkout\/[a-f0-9-]+$/);
    expect(await db.checkout.count({ where: { customerAccountId: f.account.id } })).toBe(1);
    expect((await db.skuInventory.findUniqueOrThrow({ where: { skuId: f.sku.id } })).reserved).toBe(1);
  } finally { await db.$disconnect(); }
});

test("cancellation withdrawal, rejection and refund-error recovery remain understandable and auditable", async ({ page, context }, info) => {
  test.setTimeout(90000); page.setDefaultTimeout(15000); page.on("dialog", dialog => dialog.accept());
  validateE2eTargetDatabaseUrl(process.env.DATABASE_URL!);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const f = await fixture(db); await session(db, context, f.account.id);
    await page.goto(`/group-buys/${f.group.slug}`); await page.getByRole("button", { name: "加入購物車", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("已加入購物車");
    await page.goto("/checkout");
    await page.getByLabel("收件人姓名", { exact: true }).fill("UX 取消流程顧客");
    await page.getByLabel("手機", { exact: true }).fill("0912345678");
    await page.getByLabel("配送方式", { exact: true }).selectOption("HOME_DELIVERY");
    await page.getByLabel("宅配地址", { exact: true }).fill("臺北市測試區安心路 1 號");
    await page.getByRole("button", { name: "計算配送與總額", exact: true }).click();
    await page.getByRole("button", { name: "確認金額並前往付款", exact: true }).click();
    await expect(page).toHaveURL(/\/checkout\/[a-f0-9-]+$/);
    const purchase = await db.checkout.findFirstOrThrow({ where: { customerAccountId: f.account.id } });
    await page.getByLabel("轉出帳號末五碼", { exact: true }).fill("12345");
    await page.locator('input[name="screenshot"]').setInputFiles({ name: "isolated-transfer.png", mimeType: "image/png", buffer: await sharp({ create: { width: 12, height: 12, channels: 3, background: "#92400e" } }).png().toBuffer() });
    await page.getByRole("button", { name: "提交付款回報", exact: true }).click();
    await expect(page.getByText("付款回報已收到", { exact: false })).toBeVisible();
    await login(page);
    // Setup uses the real authorized HTTP boundary; amounts represent synthetic receipts only.
    const receipt = await page.request.post("/api/checkout", { headers: { origin }, data: { operation: "receipt", checkoutId: purchase.id, data: { requestId: randomUUID(), bankReference: randomUUID(), amount: purchase.totalAmount, bankReceivedAt: new Date().toISOString(), note: "隔離測試模擬入帳", confirmed: true } } });
    expect(receipt.status(), await receipt.text()).toBe(200);
    const finalized = await page.request.post("/api/checkout", { headers: { origin }, data: { operation: "finalize", checkoutId: purchase.id, data: { confirmed: true } } }); expect(finalized.ok()).toBe(true);
    const order = await db.qbOrder.findFirstOrThrow({ where: { checkoutId: purchase.id } });
    const customer = await context.newPage(); customer.on("dialog", dialog => dialog.accept());
    const cancel = async () => {
      await customer.goto(`/my/orders/${purchase.id}`);
      const form = customer.getByRole("form", { name: "提出取消申請" });
      await form.getByLabel("取消原因", { exact: true }).selectOption("不需要");
      await form.getByRole("button").click();
      await expect(customer.getByRole("button", { name: "撤回待審申請", exact: true })).toBeVisible();
    };
    await cancel();
    await customer.getByRole("button", { name: "撤回待審申請", exact: true }).click();
    await expect(customer.getByText(/· 已撤回/)).toBeVisible();
    await cancel();
    await page.goto(`/admin/qbuy?queue=all&q=${order.orderNumber}`);
    const rejection = page.getByRole("form", { name: "拒絕取消" });
    await rejection.getByLabel("拒絕原因及顧客可見說明（必填）", { exact: true }).fill("隔離測試顧客同意繼續出貨");
    await rejection.getByRole("button").click();
    await expect(rejection).toHaveCount(0);
    await customer.reload(); await expect(customer.getByText(/· 已拒絕/)).toBeVisible();
    await expect(customer.getByText("隔離測試顧客同意繼續出貨", { exact: false })).toBeVisible();
    await cancel();
    await page.reload(); const approval = page.getByRole("form", { name: "核准取消" });
    await approval.getByLabel("審核依據及顧客可見說明", { exact: true }).fill("隔離測試模擬核准退款"); await approval.getByRole("button").click();
    const refund = page.getByRole("form", { name: "記錄退款處理結果" });
    await expect(refund).toBeVisible();
    const submitRefund = async (status: string) => {
      await refund.getByLabel("處理狀態", { exact: true }).selectOption(status);
      await refund.getByLabel("銀行交易參考（非帳號）", { exact: true }).fill(syntheticBankReference());
      await refund.getByLabel("查核依據（勿填完整銀行帳號）", { exact: true }).fill("隔離測試模擬銀行退款狀態，無真實匯款");
      if (status === "REFUNDED") await refund.getByLabel("二次確認已核實實際退款成功（僅已退款時必勾）", { exact: true }).check();
      await refund.getByRole("button").click();
      if (status === "REFUNDED") await expect(refund).toHaveCount(0);
      else await expect(refund.getByRole("status")).toContainText("操作已完成");
    };
    await submitRefund("PROCESSING"); await submitRefund("ERROR");
    await customer.reload(); await expect(customer.getByText(/退款異常，客服處理中/)).toBeVisible();
    await customer.screenshot({ path: info.outputPath("customer-refund-error.png"), fullPage: true });
    await submitRefund("PROCESSING"); await submitRefund("REFUNDED");
    await customer.reload(); await expect(customer.getByText(/訂單取消退款.*已退款/)).toBeVisible();
    expect((await db.refundObligation.findFirstOrThrow({ where: { checkoutId: purchase.id } })).status).toBe("REFUNDED");
    expect((await db.skuInventory.findUniqueOrThrow({ where: { skuId: f.sku.id } })).allocated).toBe(0);
    expect(await db.cancellationRequest.count({ where: { checkoutId: purchase.id } })).toBe(3);
    await customer.close();
  } finally { await db.$disconnect(); }
});

test("all 29 page routes: seven widths, names, landmarks, keyboard and fixed-state screenshots", async ({ browser }, info) => {
  test.setTimeout(600000);
  validateE2eTargetDatabaseUrl(process.env.DATABASE_URL!);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: "Asia/Taipei", reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors: string[] = [];
  const inventory = JSON.parse(await readFile("docs/ux-audit/inventory.json", "utf8"));
  page.on("pageerror", error => errors.push(error.message));
  const records: Record<string, unknown>[] = [];
  const productStates: Record<string, unknown>[] = [];
  try {
    const f = await fixture(db);
    await session(db, context, f.account.id);
    const unavailable = await fixture(db, 0);
    await page.goto(`/group-buys/${unavailable.group.slug}`);
    await expect(page.getByRole("button", { name: "加入購物車", exact: true })).toBeDisabled();
    await expect(page.getByText(/全站共用可售庫存 0/)).toBeVisible();
    await page.screenshot({ path: info.outputPath("product-sold-out-390.png"), fullPage: true });
    productStates.push({ route: "/group-buys/[slug]", state: "sold-out", width: 390, screenshot: "product-sold-out-390.png" });
    await db.groupBuy.update({ where: { id: unavailable.group.id }, data: { endAt: new Date(Date.now() - 1000) } });
    await page.reload();
    await expect(page.getByRole("button", { name: "加入購物車", exact: true })).toBeDisabled();
    await expect(page.getByText("團購已結束。", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("product-ended-390.png"), fullPage: true });
    productStates.push({ route: "/group-buys/[slug]", state: "ended", width: 390, screenshot: "product-ended-390.png" });
    await db.productSku.update({ where: { id: unavailable.sku.id }, data: { isActive: false } });
    await page.reload(); await expect(page.getByText("目前沒有可供訂購的商品。", { exact: true })).toBeVisible();
    for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(width);
      const screenshot = `product-empty-${width}.png`;
      if ([320, 390, 768, 1440].includes(width)) await page.screenshot({ path: info.outputPath(screenshot), fullPage: true });
      productStates.push({ route: "/group-buys/[slug]", state: "empty", width, scrollWidth, screenshot: [320, 390, 768, 1440].includes(width) ? screenshot : null });
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/group-buys/${f.group.slug}`);
    await page.getByRole("button", { name: "加入購物車", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("已加入購物車");
    await page.goto("/checkout");
    await page.getByLabel("收件人姓名", { exact: true }).fill("七尺寸驗收顧客");
    await page.getByLabel("手機", { exact: true }).fill("0912345678");
    await page.getByLabel("配送方式", { exact: true }).selectOption("HOME_DELIVERY");
    await page.getByLabel("宅配地址", { exact: true }).fill("臺北市測試區安心路 1 號");
    await page.getByRole("button", { name: "計算配送與總額", exact: true }).click();
    await page.getByRole("button", { name: "確認金額並前往付款", exact: true }).click();
    await expect(page).toHaveURL(/\/checkout\/[a-f0-9-]+$/);
    const purchase = await db.checkout.findFirstOrThrow({ where: { customerAccountId: f.account.id } });
    await page.goto(`/group-buys/${f.group.slug}`);
    await page.getByRole("button", { name: "加入購物車", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("已加入購物車");
    const replacements: Record<string, string> = {
      "/group-buys/[slug]": `/group-buys/${f.group.slug}`,
      "/orders/[publicCode]": `/orders/${f.order.publicCode}`,
      "/checkout/[id]": `/checkout/${purchase.id}`,
      "/my/orders/[checkoutId]": `/my/orders/${purchase.id}`,
      "/admin/orders/[publicCode]": `/admin/orders/${f.order.publicCode}`,
      "/admin/inventory/[skuId]": `/admin/inventory/${f.sku.id}`,
      "/admin/group-buys/[id]/edit": `/admin/group-buys/${f.group.id}/edit`,
      "/admin/products/[id]/edit": `/admin/products/${f.product.id}/edit`,
      "/admin/suppliers/[id]/edit": `/admin/suppliers/${f.supplier.id}/edit`,
      "/admin/pickup-locations/[id]/edit": `/admin/pickup-locations/${f.pickup.id}/edit`,
      "/admin/commerce": `/admin/commerce?product=${f.product.id}&group=${f.group.id}`,
      "/admin/payments": "/admin/payments?view=all",
      "/admin/qbuy": "/admin/qbuy?queue=all",
    };
    const pages: { route: string }[] = inventory.routes.filter((route: { kind: string }) => route.kind === "page");
    // Login is captured before creating the admin session; every route is required.
    pages.sort((a, b) => Number(a.route !== "/admin/login") - Number(b.route !== "/admin/login") || a.route.localeCompare(b.route));
    let loggedIn = false;
    for (const entry of pages) {
      if (entry.route.startsWith("/admin") && entry.route !== "/admin/login" && !loggedIn) { await login(page); loggedIn = true; }
      const target = replacements[entry.route] ?? entry.route;
      expect(target, `missing fixture for ${entry.route}`).not.toContain("[");
      const response = await page.goto(target);
      expect(response?.status(), target).toBe(200);
      expect(new URL(page.url()).pathname).toBe(new URL(target, origin).pathname);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      const main = page.getByRole("main");
      await expect(main).toHaveCount(1);
      const controls = await page.locator("main button,main a,main input:not([type=hidden]),main select,main textarea,main summary").evaluateAll(elements => elements.map(element => {
        const input = element as HTMLInputElement;
        return { tag: element.tagName, name: element.getAttribute("aria-label") ?? (input.labels ? [...input.labels].map(label => label.textContent).join(" ") : null) ?? element.textContent?.trim(), type: element.getAttribute("type"), href: element.getAttribute("href"), disabled: input.disabled ?? false, hiddenByDetails: Boolean(element.closest("details:not([open])")) };
      }));
      const unnamedActions = await main.locator("button,a").evaluateAll(elements => elements.filter(element => !element.getAttribute("aria-label") && !element.getAttribute("aria-labelledby") && !element.textContent?.trim() && !element.querySelector("img[alt]")).map(element => element.outerHTML.slice(0, 200)));
      expect.soft(unnamedActions, `${entry.route}: unnamed actions`).toEqual([]);
      for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => document.fonts.ready);
        const geometry = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth, offenders: [...document.querySelectorAll("main *")].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map(el => ({ tag: el.tagName, class: el.className })) }));
        expect.soft(geometry.scroll, JSON.stringify({ route: entry.route, width, ...geometry })).toBeLessThanOrEqual(width);
        const unnamed = await page.locator('main input:not([type="hidden"]),main select,main textarea').evaluateAll(elements => elements.filter(element => {
          const control = element as HTMLInputElement;
          return !control.getAttribute("aria-label") && !control.getAttribute("aria-labelledby") && !control.labels?.length;
        }).map(element => element.outerHTML.slice(0, 220)));
        expect.soft(unnamed, `${entry.route}: unnamed fields`).toEqual([]);
        const imageNameMissing = await page.locator("main img:not([alt])").count();
        expect.soft(imageNameMissing, `${entry.route}: image alt`).toBe(0);
        const contrast = width === 390 ? await textContrastIssues(page) : [];
        expect.soft(contrast, `${entry.route}: flat-colour text contrast`).toEqual([]);
        const screenshot = `${entry.route.replaceAll(/[^a-z0-9]/gi, "-") || "home"}-${width}.png`;
        if ([320, 390, 768, 1440].includes(width)) await page.screenshot({ path: info.outputPath(screenshot), fullPage: true, animations: "disabled" });
        records.push({ route: entry.route, state: "normal", width, geometry, unnamed, controls, contrast, screenshot: [320, 390, 768, 1440].includes(width) ? screenshot : null });
      }
      const skip = page.getByRole("link", { name: "跳至主要內容", exact: true });
      if (await skip.count()) { await skip.focus(); await page.keyboard.press("Enter"); await expect(main).toBeFocused(); }
      await page.setViewportSize({ width: 390, height: 900 });
      for (const control of await main.locator('a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex="0"]').all()) {
        if (!await control.isVisible() || !await control.isEnabled()) continue;
        const bounds = await control.boundingBox();
        if (!bounds) continue;
        if (bounds.width <= 1 || bounds.height <= 1) {
          if (await control.getAttribute("type") === "file") {
            await control.focus();
            expect(await control.evaluate(element => parseFloat(getComputedStyle(element.closest("label")!).outlineWidth))).toBeGreaterThan(0);
          }
          continue;
        }
        await control.hover(); await control.focus(); await expect(control).toBeFocused();
        const indicator = await control.evaluate(element => { const style = getComputedStyle(element); return { outline: parseFloat(style.outlineWidth), shadow: style.boxShadow }; });
        expect.soft(indicator.outline > 0 || indicator.shadow !== "none", `${entry.route}: visible focus for ${await control.textContent()}`).toBe(true);
      }
      for (const summary of await main.locator("summary").all()) {
        if (!await summary.isVisible()) continue;
        const details = summary.locator("..");
        const before = await details.getAttribute("open");
        await summary.focus(); await summary.press("Space");
        expect(await details.getAttribute("open")).not.toBe(before);
        await summary.press("Space");
        expect(await details.getAttribute("open")).toBe(before);
      }
    }
    expect(records).toHaveLength(29 * 7);
    expect(errors).toEqual([]);
  } finally {
    await writeFile(info.outputPath("route-results.json"), JSON.stringify({ sourceDigest: inventory.sourceDigest, records, errors }, null, 2));
    await writeFile(info.outputPath("product-state-results.json"), JSON.stringify({ sourceDigest: inventory.sourceDigest, records: productStates }, null, 2));
    await context.close(); await db.$disconnect();
  }
});
