import sharp from "sharp";
import { expect, test, type Page, type Locator } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { validateE2eTargetDatabaseUrl } from "../scripts/lib/e2e-database";
import { captureResponsive } from "./helpers/capture-responsive";
function operation(page: Page | Locator, name: string) { return page.locator(`form:has(input[name="operation"][value="${name}"])`); }
async function save(form: Locator) {
    await form.getByRole("button", { name: "儲存", exact: true }).click();
    await expect(form.getByRole("status")).toHaveText("已儲存。");
}
function taipeiDate(hours: number) { return new Date(Date.now() + (8 + hours) * 3600000).toISOString().slice(0, 16); }
test("QBUY milestone 2: three groups checkout, private report, manual bank confirmation and QB orders", async ({ page, browser }, info) => {
    test.setTimeout(240000);
    page.setDefaultTimeout(15000);
    page.on("dialog", (dialog) => dialog.accept());
    const suffix = Date.now();
    const productName = `QBUY 驗收上衣 ${suffix}`;
    const categoryName = `QBUY 服飾 ${suffix}`;
    const skuCode = `QBUY-${suffix}-BLACK-S`;
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL!);
    await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "登入", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/products/new");
    await page.getByLabel("商品名稱 *").fill(productName);
    await page.getByLabel("預設售價 *").fill("299");
    await page.getByLabel("預設成本 *").fill("100");
    await page.getByLabel("單位 *").fill("件");
    await page.getByRole("button", { name: "新增商品", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/products$/);
    await page.goto("/admin/commerce");
    const productOption = page.locator('select[name="product"] option').filter({ hasText: productName });
    const productId = await productOption.getAttribute("value");
    await page.locator('select[name="product"]').selectOption(productId!);
    await page.getByRole("button", { name: "管理商品 SKU" }).click();
    await operation(page, "option").getByLabel("新增規格維度（顏色／尺寸）").fill("顏色");
    await save(operation(page, "option"));
    await operation(page, "option").getByLabel("新增規格維度（顏色／尺寸）").fill("尺寸");
    await save(operation(page, "option"));
    for (const [name, values] of [["顏色", ["黑", "白"]], ["尺寸", ["S", "M"]]] as const) {
        const form = operation(page, "value").filter({ has: page.getByLabel(`新增${name}選項`) });
        for (const value of values) {
            await form.getByLabel(`新增${name}選項`).fill(value);
            await save(form);
        }
    }
    for (const [code, color, size] of [[skuCode, "黑", "S"], [`QBUY-${suffix}-WHITE-M`, "白", "M"]]) {
        const form = operation(page, "sku");
        await form.getByLabel("新增 SKU code").fill(code);
        await form.getByLabel("顏色").selectOption({ label: color });
        await form.getByLabel("尺寸").selectOption({ label: size });
        await save(form);
    }
    await expect(page.getByRole("article")).toHaveCount(2);
    const sku = page.getByRole("article").filter({ has: page.getByRole("heading", { name: new RegExp(`^${skuCode}`) }) });
    const inventory = operation(sku, "inventory");
    const testedSkuId = await inventory.locator('input[name="skuId"]').getAttribute("value");
    await inventory.getByLabel("數量", { exact: true }).fill("20");
    await inventory.getByLabel("原因（至少 3 字）").fill("驗收實體盤點 20 件");
    await inventory.getByLabel("已核實實體數量及舊單").check();
    await save(inventory);
    await expect(sku).toContainText("實體 20 − 預留 0 − 已付款占用 0 = 可售 20");
    const shipping = operation(sku, "skuEdit");
    await shipping.getByLabel("宅配", { exact: true }).check();
    for (const label of ["重量 g", "長 mm", "寬 mm", "高 mm"])
        await shipping.getByLabel(label, { exact: true }).fill("10");
    await save(shipping);
    await sku.locator("summary").click();
    await expect(sku).toContainText("驗收實體盤點 20 件");
    await page.screenshot({ path: info.outputPath("admin-sku-inventory.png"), fullPage: true });
    await captureResponsive(page, info, "admin-sku-inventory");
    const category = operation(page, "category").filter({ has: page.getByLabel("新增分類", { exact: true }) });
    await category.getByLabel("新增分類", { exact: true }).fill(categoryName);
    await save(category);
    const groupIds: string[] = [];
    const slugs: string[] = [];
    for (const [letter, price] of [["A", 299], ["B", 279], ["C", 199]] as const) {
        const title = `QBUY ${letter} 驗收開團 ${suffix}`;
        await page.goto("/admin/group-buys/new");
        await page.getByLabel("團購名稱 *").fill(title);
        await page.getByLabel("開始時間 *").fill(taipeiDate(-1));
        await page.getByLabel("結束時間 *").fill(taipeiDate(48));
        await page.getByRole("button", { name: "建立草稿" }).click();
        await expect(page).toHaveURL(/\/admin\/group-buys$/);
        await page.goto("/admin/commerce");
        const groupId = await page.locator('select[name="group"] option').filter({ hasText: title }).getAttribute("value");
        groupIds.push(groupId!);
        await page.locator('select[name="group"]').selectOption(groupId!);
        await page.getByRole("button", { name: "管理開團販售" }).click();
        const offer = operation(page, "offer").first();
        const skuId = await offer.locator('select[name="skuId"] option').filter({ hasText: skuCode }).getAttribute("value");
        await offer.locator('select[name="skuId"]').selectOption(skuId!);
        await offer.getByLabel("開團價格 NT$").fill(String(price));
        await save(offer);
        const group = operation(page, "group");
        await group.locator('select[name="categoryId"]').selectOption({ label: categoryName });
        await group.locator('select[name="visibility"]').selectOption("PUBLISHED");
        await group.locator('select[name="isFeatured"]').selectOption("true");
        await group.locator('select[name="allowsCombinedShipping"]').selectOption(letter === "C" ? "false" : "true");
        await save(group);
        // Read the public link through the rendered homepage.
        await page.goto(`/?q=${encodeURIComponent(title)}`);
        const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
        slugs.push((await card.getByRole("link", { name: title, exact: true }).getAttribute("href"))!);
    }
    await page.goto("/admin/payments");
    await page.getByRole("main").getByText("銀行與配送設定", { exact: true }).click();
    const bank = page.locator("form").filter({ has: page.getByRole("button", { name: "儲存銀行設定", exact: true }) });
    for (const [name, value] of [["bankName", "隔離測試銀行"], ["bankCode", "000"], ["bankAccount", "0000000000"], ["accountName", "模擬收款"]])
        await bank.locator(`[name="${name}"]`).fill(value);
    await bank.getByLabel("開放轉帳結帳").check();
    await bank.getByRole("button").click();
    await expect(bank.getByRole("status")).toHaveText("已儲存。");
    const rate = page.locator("form").filter({ has: page.getByRole("button", { name: "儲存配送能力與費率", exact: true }) });
    for (const [name, value] of [["fee", "60"], ["freeThreshold", "500"], ["maxWeightGrams", "100000"], ["maxLengthMm", "1000"], ["maxWidthMm", "1000"], ["maxHeightMm", "1000"], ["capabilityEvidence", "隔離測試模擬宅配能力"]])
        await rate.locator(`[name="${name}"]`).fill(value);
    await rate.getByLabel("能力已確認並啟用").check();
    await rate.getByRole("button").click();
    await expect(rate.getByRole("status")).toHaveText("已儲存。");
    const url = process.env.DATABASE_URL!;
    validateE2eTargetDatabaseUrl(url);
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), log: [] });
    const context = await browser.newContext();
    const customer = await context.newPage();
    customer.setDefaultTimeout(15000);
    try {
        const token = randomBytes(32).toString("base64url");
        const account = await db.customerAccount.create({ data: { lineUserId: `milestone2-${suffix}`, displayName: "M2 隔離驗收顧客", lastLoginAt: new Date() } });
        await db.customerSession.create({ data: { customerAccountId: account.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
        await context.addCookies([{ name: "customer_session", value: token, url: "http://localhost:3100", httpOnly: true, sameSite: "Lax" }]);
        for (const slug of slugs) {
            await customer.goto(slug);
            await customer.getByRole("button", { name: "加入購物車" }).click();
            await expect(customer.getByRole("status")).toHaveText("已加入購物車；尚未預留庫存。");
        }
        await customer.goto("/cart");
        await expect(customer.getByText("有效商品小計 NT$777")).toBeVisible();
        await captureResponsive(customer, info, "cart-with-items");
        await customer.getByRole("link", { name: "前往跨團結帳" }).click();
        await customer.getByLabel("收件人姓名").fill(`驗收付款人 ${suffix}`);
        await customer.getByLabel("手機", { exact: true }).fill("0912345678");
        await customer.getByLabel("宅配地址").fill("台北市測試區隔離驗收路 1 號");
        await customer.getByRole("button", { name: "計算配送與總額" }).click();
        await expect(customer.getByRole("status")).toHaveText("商品 NT$777＋運費 NT$60＝應付 NT$837");
        await captureResponsive(customer, info, "checkout-shipping-groups");
        await customer.getByRole("button", { name: "確認金額並前往付款" }).click();
        await expect(customer).toHaveURL(/\/checkout\/[0-9a-f-]+$/);
        const checkoutId = new URL(customer.url()).pathname.split("/").at(-1)!;
        let checkout = await db.checkout.findUniqueOrThrow({ where: { id: checkoutId }, include: { items: true, orders: true, fulfillmentGroups: true } });
        expect(checkout.orders).toHaveLength(0);
        expect(checkout.fulfillmentGroups).toHaveLength(2);
        expect(checkout.expiresAt.getTime() - checkout.createdAt.getTime()).toBeGreaterThan(6 * 3600000 - 1000);
        expect(await db.skuInventory.findUnique({ where: { skuId: testedSkuId! } })).toMatchObject({ onHand: 20, reserved: 3, allocated: 0 });
        await captureResponsive(customer, info, "bank-transfer-report-form");
        await customer.getByLabel("轉出帳號末五碼").fill("12345");
        const png = await sharp({ create: { width: 100, height: 100, channels: 3, background: "white" } }).png().toBuffer();
        await customer.getByLabel(/轉帳截圖/).setInputFiles({ name: "simulation.png", mimeType: "image/png", buffer: png });
        await customer.getByRole("button", { name: "提交付款回報" }).click();
        await expect(customer.getByText("待 QBUY 確認", { exact: true })).toBeVisible();
        await expect(customer.getByText(/^剩餘/)).toHaveCount(0);
        await captureResponsive(customer, info, "bank-transfer-reported");
        const outsider = await browser.newContext();
        try {
            expect((await outsider.request.get(`/api/checkout/${checkoutId}/screenshot`)).status()).toBe(401);
        }
        finally {
            await outsider.close();
        }
        const imageResponse = await context.request.get(`/api/checkout/${checkoutId}/screenshot`);
        expect(imageResponse.status()).toBe(200);
        expect(imageResponse.headers()["cache-control"]).toContain("no-store");
        await page.goto("/admin/payments");
        const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: `驗收付款人 ${suffix} · 0912345678` }) });
        await card.getByText("確認銀行入帳／補差額", { exact: true }).click();
        await card.getByLabel("銀行交易參考號（不可重複）").fill(`simulation-${suffix}`);
        await card.getByLabel("本筆實際入帳金額").fill("837");
        await card.getByLabel("銀行入帳時間", { exact: true }).fill(new Date(Date.now() - 60000).toLocaleString("sv-SE").slice(0, 16).replace(" ", "T"));
        await card.getByLabel("查核依據／模擬測試註記").fill("隔離測試：人工模擬銀行入帳，未連接銀行");
        await card.getByRole("button", { name: "確認已收款", exact: true }).click();
        await expect(card.getByText(/狀態 已入帳，待建單/)).toBeVisible();
        await page.screenshot({ path: info.outputPath("admin-bank-reconciliation.png"), fullPage: true });
        await captureResponsive(page, info, "admin-bank-reconciliation");
        await card.getByRole("button", { name: "建立全部 QB 訂單／重試建單" }).click();
        await expect(card).toHaveCount(0);
        checkout = await db.checkout.findUniqueOrThrow({ where: { id: checkoutId }, include: { items: true, orders: true, fulfillmentGroups: true } });
        expect(checkout.orders).toHaveLength(3);
        expect(new Set(checkout.orders.map(o => o.orderNumber)).size).toBe(3);
        expect(checkout.orders.reduce((sum, o) => sum + o.paidAmount, 0)).toBe(837);
        expect(await db.skuInventory.findUnique({ where: { skuId: testedSkuId! } })).toMatchObject({ onHand: 20, reserved: 0, allocated: 3 });
        expect(await db.inventoryMovement.count({ where: { checkoutId, kind: "ALLOCATE" } })).toBe(1);
        const repeat = await page.evaluate(async (id) => { const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "finalize", checkoutId: id, data: { confirmed: true } }) }); return r.status; }, checkoutId);
        expect(repeat).toBe(200);
        expect(await db.qbOrder.count({ where: { checkoutId } })).toBe(3);
        await customer.goto("/my/orders");
        const purchase = customer.getByRole("article").filter({ has: customer.getByRole("link", { name: /本次購買/ }) });
        await expect(purchase).toHaveCount(1);
        for (const order of checkout.orders)
            await expect(purchase).toContainText(order.orderNumber);
        await customer.screenshot({ path: info.outputPath("my-purchase-three-qb-orders.png"), fullPage: true });
        await captureResponsive(customer, info, "my-orders");
        await customer.setViewportSize({ width: 390, height: 844 });
        await customer.goto(`/checkout/${checkoutId}`);
        expect(await customer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        // Verify the manually maintained, trusted FamilyMart directory through the UI.
        await page.goto(`/admin/commerce?product=${productId}`);
        const editShipping = operation(page.getByRole("article").filter({ has: page.getByRole("heading", { name: new RegExp(`^${skuCode}`) }) }), "skuEdit");
        await editShipping.getByLabel("全家", { exact: true }).check();
        await save(editShipping);
        await page.goto("/admin/payments");
        await page.getByRole("main").getByText("銀行與配送設定", { exact: true }).click();
        const familyRate = page.locator("form").filter({ has: page.getByRole("button", { name: "儲存配送能力與費率", exact: true }) });
        await familyRate.locator('[name="method"]').selectOption("FAMILY_MART");
        for (const [name, value] of [["fee", "60"], ["freeThreshold", "500"], ["maxWeightGrams", "100000"], ["maxLengthMm", "1000"], ["maxWidthMm", "1000"], ["maxHeightMm", "1000"], ["capabilityEvidence", "隔離測試模擬全家能力"]])
            await familyRate.locator(`[name="${name}"]`).fill(value);
        await familyRate.getByLabel("能力已確認並啟用").check();
        await familyRate.getByRole("button").click();
        await expect(familyRate.getByRole("status")).toHaveText("已儲存。");
        const familyStore = page.locator("form").filter({ has: page.getByRole("button", { name: "儲存已核實全家門市", exact: true }) });
        await familyStore.getByLabel("全家門市代碼").fill(`FM${suffix}`);
        await familyStore.getByLabel("全家門市名稱").fill("隔離測試全家門市");
        await familyStore.getByLabel("全家門市地址").fill("台北市隔離測試全家門市地址");
        await familyStore.getByLabel("門市資料核實依據").fill("隔離驗收模擬門市資料，未實際串接物流商");
        await familyStore.getByLabel("已核實並啟用門市").check();
        await familyStore.getByRole("button").click();
        await expect(familyStore.getByRole("status")).toHaveText("已儲存。");
        // A second purchase is intentional: acknowledged items have left the cart.
        for (const slug of slugs) {
            await customer.goto(slug);
            await customer.getByRole("button", { name: "加入購物車", exact: true }).click();
            await expect(customer.getByRole("status")).toContainText("已加入購物車");
        }
        await customer.goto("/checkout");
        await customer.getByLabel("收件人姓名").fill("全家驗收顧客");
        await customer.getByLabel("手機", { exact: true }).fill("0912345678");
        await customer.getByLabel("配送方式").selectOption("FAMILY_MART");
        await customer.getByLabel("全家門市", { exact: true }).selectOption({ label: "隔離測試全家門市 · 台北市隔離測試全家門市地址" });
        await customer.getByRole("button", { name: "計算配送與總額" }).click();
        await expect(customer.getByRole("status")).toHaveText("商品 NT$777＋運費 NT$60＝應付 NT$837");
        await customer.getByRole("button", { name: "確認金額並前往付款" }).click();
        await expect(customer.getByText(/配送：全家/)).toContainText("隔離測試全家門市");
    }
    catch (error) {
        await customer.screenshot({ path: info.outputPath("checkout-failure.png"), fullPage: true }).catch(() => undefined);
        throw error;
    }
    finally {
        await context.close();
        await db.$disconnect();
    }
});
