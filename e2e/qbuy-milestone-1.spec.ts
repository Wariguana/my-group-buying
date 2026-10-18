import { expect, test, type Page, type Locator } from "@playwright/test";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { validateE2eTargetDatabaseUrl } from "../scripts/lib/e2e-database";

function operation(page: Page | Locator, name: string) { return page.locator(`form:has(input[name="operation"][value="${name}"])`); }
async function save(form: Locator) {
  await form.getByRole("button", { name: "儲存", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("已儲存。");
}
function taipeiDate(hours: number) { return new Date(Date.now() + (8 + hours) * 3600000).toISOString().slice(0, 16); }

test("QBUY milestone 1: Admin UI to cross-group shared-stock cart and OAuth return", async ({ page, browser }, info) => {
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
    for (const value of values) { await form.getByLabel(`新增${name}選項`).fill(value); await save(form); }
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
  await sku.locator("summary").click();
  await expect(sku).toContainText("驗收實體盤點 20 件");
  await page.screenshot({ path: info.outputPath("admin-sku-inventory.png"), fullPage: true });
  const category = operation(page, "category").filter({ has: page.getByLabel("新增分類", { exact: true }) });
  await category.getByLabel("新增分類", { exact: true }).fill(categoryName);
  await save(category);

  const groupIds: string[] = []; const slugs: string[] = [];
  for (const [letter, price] of [["A", 299], ["B", 279]] as const) {
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
    await save(group);
    // Read the public link through the rendered homepage.
    await page.goto(`/?q=${encodeURIComponent(title)}`);
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    slugs.push((await card.getByRole("link", { name: "查看團購" }).getAttribute("href"))!);
  }
  const context = await browser.newContext(); const customer = await context.newPage();
  customer.setDefaultTimeout(15000);
  customer.on("dialog", (dialog) => dialog.accept());
  try {
    await customer.goto("/");
    await expect(customer.getByRole("heading", { name: "精選開團", exact: true })).toBeVisible();
    await expect(customer.getByRole("navigation", { name: "商品分類" })).toContainText(categoryName);
    await customer.getByLabel("搜尋商品", { exact: true }).fill(productName);
    await customer.getByRole("button", { name: "搜尋", exact: true }).click();
    await expect(customer.getByRole("listitem")).toHaveCount(2);
    for (const path of slugs) {
      await customer.goto(path);
      await expect(customer.getByText(/全站共用可售庫存 20/)).toBeVisible();
      await customer.getByRole("button", { name: "加入購物車" }).click();
      await expect(customer.getByRole("status")).toHaveText("已加入購物車；尚未預留庫存。");
    }
    await customer.goto("/cart");
    await expect(customer.getByText("有效商品小計 NT$578")).toBeVisible();
    await expect(customer.getByRole("article")).toHaveCount(2);
    const firstQuantity = customer.getByRole("article").first().locator('input[type="number"]');
    await firstQuantity.fill("2"); await expect(customer.getByText("有效商品小計 NT$877")).toBeVisible();
    await firstQuantity.fill("1"); await expect(customer.getByText("有效商品小計 NT$578")).toBeVisible();
    await customer.screenshot({ path: info.outputPath("cross-group-cart.png"), fullPage: true });

    // Use the real OAuth callback denial route (without external LINE credentials).
    const state = "A".repeat(43);
    await context.addCookies([{ name: "line_oauth_state", value: state, url: "http://localhost:3100/api/auth/line/callback", httpOnly: true, sameSite: "Lax" }]);
    await customer.goto(`/api/auth/line/callback?state=${state}&error=access_denied`);
    await expect(customer).toHaveURL(/line_login=denied/);
    await customer.goto("/cart"); await expect(customer.getByText("有效商品小計 NT$578")).toBeVisible();

    // Authenticated customer-session reload/logout: fixture creation is isolated to this test DB.
    const url = process.env.DATABASE_URL!; validateE2eTargetDatabaseUrl(url);
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), log: [] });
    try {
      const token = randomBytes(32).toString("base64url");
      const account = await db.customerAccount.create({ data: { lineUserId: `qbuy-e2e-${suffix}`, displayName: "QBUY 驗收顧客", lastLoginAt: new Date() } });
      await db.customerSession.create({ data: { customerAccountId: account.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
      await context.addCookies([{ name: "customer_session", value: token, url: "http://localhost:3100", httpOnly: true, sameSite: "Lax" }]);
      await customer.reload(); await expect(customer.getByText("QBUY 驗收顧客")).toBeVisible(); await expect(customer.getByText("有效商品小計 NT$578")).toBeVisible();
      await customer.getByRole("button", { name: "登出", exact: true }).click();
      await customer.goto("/cart"); await expect(customer.getByText("有效商品小計 NT$578")).toBeVisible();
    } finally { await db.$disconnect(); }

    await page.goto(`/admin/commerce?group=${groupIds[0]}`);
    const edit = operation(page, "offer").last(); await edit.getByLabel("開團價格 NT$").fill("310"); await save(edit);
    await customer.getByRole("button", { name: "重新驗價與庫存" }).click();
    await expect(customer.getByText("價格已變動", { exact: true })).toBeVisible(); await expect(customer.getByText("有效商品小計 NT$279")).toBeVisible();
    await customer.getByRole("button", { name: "接受最新價格" }).click(); await expect(customer.getByText("有效商品小計 NT$589")).toBeVisible();
    await page.goto(`/admin/commerce?product=${productId}`);
    const inv = operation(page.getByRole("article").filter({ has: page.getByRole("heading", { name: new RegExp(`^${skuCode}`) }) }), "inventory");
    await inv.locator('select[name="kind"]').selectOption("COUNT"); await inv.getByLabel("數量", { exact: true }).fill("1"); await inv.getByLabel("原因（至少 3 字）").fill("驗收盤點調整"); await inv.getByLabel("已核實實體數量及舊單").check(); await save(inv);
    await customer.getByRole("button", { name: "重新驗價與庫存" }).click(); await expect(customer.getByText("有效商品小計 NT$0")).toBeVisible(); await expect(customer.getByText("庫存不足（含跨團同 SKU 合計）", { exact: true })).toHaveCount(2);
    await page.goto(`/admin/commerce?group=${groupIds[0]}`); await operation(page, "group").locator('select[name="visibility"]').selectOption("UNLISTED"); await save(operation(page, "group"));
    await customer.getByRole("button", { name: "重新驗價與庫存" }).click(); await expect(customer.getByRole("article").first()).toContainText("已下架");
    const expiryUrl = process.env.DATABASE_URL!; validateE2eTargetDatabaseUrl(expiryUrl);
    const expiryDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: expiryUrl }), log: [] });
    try { await expiryDb.groupBuy.update({ where: { id: groupIds[1] }, data: { endAt: new Date(Date.now() - 1000) } }); }
    finally { await expiryDb.$disconnect(); }
    await customer.getByRole("button", { name: "重新驗價與庫存" }).click(); await expect(customer.getByRole("article").last()).toContainText("已截止");
    await customer.screenshot({ path: info.outputPath("cart-invalid-status.png"), fullPage: true });
    await customer.setViewportSize({ width: 390, height: 844 }); await customer.goto("/cart");
    expect(await customer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await customer.getByRole("article").first().getByRole("button", { name: "移除", exact: true }).click();
    await expect(customer.getByRole("article")).toHaveCount(1);

    // More than one page of append-only no-op count fixtures, in this disposable DB only.
    const historyDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: expiryUrl }), log: [] });
    try {
      const initial = await historyDb.inventoryMovement.findFirstOrThrow({ where: { skuId: testedSkuId! }, orderBy: { createdAt: "asc" } });
      await historyDb.$transaction(async (tx) => {
        await tx.inventoryMovement.createMany({ data: Array.from({ length: 31 }, (_, i) => ({ requestId: randomUUID(), skuId: testedSkuId!, actorId: initial.actorId,
          kind: "COUNT", beforeOnHand: 1, afterOnHand: 1, reserved: 0, allocated: 0, reason: `QA no-op physical count ${i}`, createdAt: new Date(Date.now() + i) })) });
        await tx.skuInventory.update({ where: { skuId: testedSkuId! }, data: { version: { increment: 31 } } });
      });
    } finally { await historyDb.$disconnect(); }
    await page.goto(`/admin/commerce?product=${productId}`);
    await page.getByRole("article").filter({ has: page.getByRole("heading", { name: new RegExp(`^${skuCode}`) }) }).getByRole("link", { name: "查看完整庫存流水帳" }).click();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(30);
    await page.getByRole("link", { name: "較早紀錄 →" }).click();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(3);
    await expect(page.getByRole("table")).toContainText("驗收實體盤點 20 件");
    await page.getByRole("link", { name: "回最新紀錄" }).click();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(30);
    await customer.goto(`/admin/inventory/${testedSkuId}`); await expect(customer).toHaveURL(/\/admin\/login$/);
  } finally {
    // The outer runner owns and drops the entire disposable database after server exit.
    await context.close();
  }
});
