import sharp from "sharp";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { validateE2eTargetDatabaseUrl } from "../scripts/lib/e2e-database";
import { formatTaipeiDateTimeLocal } from "../src/lib/group-buys/time";
import { inspectUi } from "./helpers/ui-consistency";

const operation = (scope: Page | Locator, name: string) => scope.locator(`form:has(input[name="operation"][value="${name}"])`);
async function save(form: Locator) {
  await form.getByRole("button", { name: "儲存", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("已儲存。");
}

test("compact homepage: ADM fixtures, image ratios, filters, SKU cart and purchase", async ({ page, browser }, info) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(15000);
  page.on("dialog", dialog => dialog.accept());
  validateE2eTargetDatabaseUrl(process.env.DATABASE_URL!);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const suffix = `HOME-${Date.now()}`;
  const records: object[] = [];
  const errors: string[] = [];
  const consumerContext = await browser.newContext();
  const consumer = await consumerContext.newPage();
  consumer.setDefaultTimeout(15000);
  consumer.on("pageerror", error => errors.push(error.message));
  consumer.on("dialog", dialog => dialog.accept());
  const groups: { id: string; title: string; slug: string; category: string }[] = [];
  try {
    await page.goto("/admin/login");
    await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
    await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "登入", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/suppliers/new");
    await page.getByLabel("供應商名稱 *").fill(`${suffix} 本機測試供應商`);
    await page.getByRole("button", { name: "新增供應商", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/suppliers$/);
    await page.goto("/admin/commerce");
    const categories = [`${suffix} 食品`, `${suffix} 日用品`];
    for (const name of categories) {
      await operation(page, "category").filter({ has: page.getByLabel("新增分類", { exact: true }) }).getByLabel("新增分類", { exact: true }).fill(name);
      await save(operation(page, "category").filter({ has: page.getByLabel("新增分類", { exact: true }) }));
    }
    const products: { name: string; codes: string[] }[] = [];
    for (const [letter, multi] of [["A", false], ["B", true], ["C", false]] as const) {
      const name = `${suffix} ${letter} ${letter === "C" ? "每日安心補給可重複使用隨身瓶與清潔配件超長商品名稱完整呈現測試" : letter === "B" ? "雙規格日常組合" : "方形包裝點心"}`;
      await page.goto("/admin/products/new");
      await page.getByLabel("商品名稱 *").fill(name);
      await page.getByLabel("預設售價 *").fill("199");
      await page.getByLabel("預設成本 *").fill("80");
      await page.getByLabel("單位 *").fill("件");
      await page.getByLabel("供應商", { exact: true }).selectOption({ label: `${suffix} 本機測試供應商` });
      await page.getByRole("button", { name: "新增商品", exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/products$/);
      await page.goto("/admin/commerce");
      await page.getByRole("combobox", { name: "選擇商品", exact: true }).selectOption({ label: `${name}／舊庫存，待盤點` });
      await page.getByRole("button", { name: "管理商品 SKU", exact: true }).click();
      if (multi) {
        await operation(page, "option").getByLabel("新增規格維度（顏色／尺寸）").fill("容量");
        await save(operation(page, "option"));
        for (const value of ["小份", "大份"]) {
          await operation(page, "value").getByLabel("新增容量選項").fill(value);
          await save(operation(page, "value"));
          await operation(page, "sku").getByLabel("新增 SKU code").fill(`${suffix}-${letter}-${value === "小份" ? "S" : "L"}`);
          await operation(page, "sku").getByRole("combobox", { name: "容量", exact: true }).selectOption({ label: value });
          await save(operation(page, "sku"));
        }
      } else {
        await operation(page, "defaultSku").getByRole("button", { name: "儲存", exact: true }).click();
        await expect(operation(page, "skuEdit")).toHaveCount(1);
      }
      const codes: string[] = [];
      for (const article of await page.getByRole("article").all()) {
        const code = await operation(article, "skuEdit").getByLabel("SKU code", { exact: true }).inputValue();
        codes.push(code);
        const inventory = operation(article, "inventory");
        await inventory.getByLabel("數量", { exact: true }).fill("30");
        await inventory.getByLabel("原因（至少 3 字）").fill("首頁驗收合成資料起始盤點");
        await inventory.getByLabel("已核實實體數量及舊單").check();
        await save(inventory);
        const shipping = operation(article, "skuEdit");
        await shipping.getByLabel("宅配", { exact: true }).check();
        for (const label of ["重量 g", "長 mm", "寬 mm", "高 mm"]) await shipping.getByLabel(label, { exact: true }).fill("100");
        await save(shipping);
      }
      products.push({ name, codes });
    }
    for (const [index, letter, width, height] of [[0, "A", 600, 600], [1, "B", 900, 450], [2, "C", 450, 900], [0, "D", 0, 0]] as const) {
      const title = `${suffix} ${letter} ${products[index].name.split(`${suffix} `)[1]}`;
      await page.goto("/admin/group-buys/new");
      await page.getByLabel("團購名稱 *").fill(title);
      await page.getByLabel("說明", { exact: true }).fill("本機首頁流程測試，所有商品與圖片均為自行產生的合成資料。".repeat(letter === "C" ? 15 : 1));
      await page.getByLabel("開始時間 *").fill(formatTaipeiDateTimeLocal(new Date(Date.now() - 3600000)));
      await page.getByLabel("結束時間 *").fill(formatTaipeiDateTimeLocal(new Date(Date.now() + 86400000 * (index + 2))));
      if (width) {
        const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fffbeb"/><rect x="10%" y="10%" width="80%" height="80%" rx="24" fill="${letter === "A" ? "#d97706" : letter === "B" ? "#047857" : "#0369a1"}"/><text x="50%" y="52%" text-anchor="middle" font-family="sans-serif" font-size="72" fill="white">QBUY ${letter}</text></svg>`;
        const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
        await page.getByLabel("選擇圖片上傳").setInputFiles({ name: `home-${letter}.png`, mimeType: "image/png", buffer });
        await expect(page.getByAltText("商品圖片 1")).toBeVisible();
      }
      await page.getByRole("button", { name: "建立草稿", exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/group-buys$/);
      await page.goto("/admin/commerce");
      const id = await page.getByRole("combobox", { name: "選擇開團", exact: true }).locator("option").filter({ hasText: title }).getAttribute("value");
      await page.getByRole("combobox", { name: "選擇開團", exact: true }).selectOption(id!);
      await page.getByRole("button", { name: "管理開團販售", exact: true }).click();
      for (const [skuIndex, code] of products[index].codes.entries()) {
        const offer = operation(page, "offer").first();
        await offer.getByRole("combobox", { name: "SKU", exact: true }).selectOption({ label: `${products[index].name}／${code}` });
        await offer.getByLabel("開團價格 NT$", { exact: true }).fill(String([199, 299, 259][index] + skuIndex * 100));
        await save(offer);
      }
      const group = operation(page, "group");
      const category = categories[index === 0 ? 0 : 1];
      await group.getByRole("combobox", { name: "分類", exact: true }).selectOption({ label: category });
      await group.getByRole("combobox", { name: "展示狀態", exact: true }).selectOption("PUBLISHED");
      await group.getByRole("combobox", { name: "精選", exact: true }).selectOption("true");
      await group.getByLabel("精選排序", { exact: true }).fill(String(index + 1));
      await save(group);
      const row = await db.groupBuy.findUniqueOrThrow({ where: { id: id! } });
      groups.push({ id: row.id, slug: row.slug, title, category });
    }
    // ADM correctly rejects re-publishing an expired group. Simulate elapsed time only
    // after its normal UI publication, within the validated disposable database.
    await db.groupBuy.update({ where: { id: groups[3].id }, data: { startAt: new Date(Date.now() - 7200000), endAt: new Date(Date.now() - 3600000) } });
    const search = async (value: string) => {
      if (consumer.viewportSize()!.width < 640) await consumer.getByRole("button", { name: "搜尋團購", exact: true }).click();
      await consumer.getByRole("textbox", { name: "搜尋商品", exact: true }).fill(value);
      await consumer.getByRole("button", { name: "搜尋", exact: true }).click();
    };
    await consumer.goto("/");
    await search(suffix);
    const list = consumer.getByRole("region", { name: "商品列表" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await expect(consumer.getByText("3 個團購可加入", { exact: true })).toBeVisible();
    await expect(list.getByRole("heading", { level: 3 })).toHaveText([groups[2].title, groups[1].title, groups[0].title]);
    await expect(list.getByRole("listitem").filter({ hasText: groups[1].title })).toContainText("NT$299起");
    for (const width of [1440, 1280, 1024, 768, 390, 360, 320]) {
      await consumer.setViewportSize({ width, height: 900 });
      await inspectUi(consumer);
      const first = await list.getByRole("listitem").first().boundingBox();
      expect(first!.y).toBeLessThan(480);
      for (const image of await list.getByRole("img").all()) {
        await expect(image).toHaveCSS("object-fit", "contain");
        const ratio = await image.evaluate(el => { const r = el.getBoundingClientRect(); return r.width / r.height; });
        expect(ratio).toBeCloseTo(width >= 640 ? 4 / 3 : 1, 1);
      }
      await consumer.screenshot({ path: info.outputPath(`home-${width}.png`), fullPage: true });
      if (width < 640) await consumer.getByRole("button", { name: "搜尋團購", exact: true }).click();
      const input = consumer.getByRole("textbox", { name: "搜尋商品", exact: true });
      const inputBox = await input.boundingBox();
      const buttonBox = await consumer.getByRole("button", { name: "搜尋", exact: true }).boundingBox();
      expect(inputBox!.height).toBeCloseTo(buttonBox!.height, 0);
      if (width < 640) {
        await expect(input).toBeFocused();
        await expect(consumer.locator("body")).toHaveCSS("overflow", "hidden");
        await consumer.screenshot({ path: info.outputPath(`home-search-${width}.png`), fullPage: true });
        await input.press("Escape");
        await expect(consumer.getByRole("dialog")).toHaveCount(0);
        await expect(consumer.getByRole("button", { name: "搜尋團購", exact: true })).toBeFocused();
        await expect(consumer.locator("body")).not.toHaveCSS("overflow", "hidden");
      }
      await expect(consumer.getByRole("link", { name: "更多精選", exact: true })).toHaveCount(0);
      await expect(consumer.getByRole("link", { name: "查看已結束團購", exact: true })).toHaveCount(0);
      await expect(consumer.getByRole("combobox", { name: "排序", exact: true })).toHaveValue("latest");
      const columns = await consumer.locator(".qbuy-storefront-grid").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
      expect(columns).toBe(width >= 1280 ? 4 : width >= 960 ? 3 : width >= 360 ? 2 : 1);
      records.push({ width, columns, cards: 3, firstCardTop: first!.y, overflow: false, images: "square, landscape and portrait loaded; contain; mobile 1:1, desktop 4:3", searchControlsMatchHeight: true });
    }
    await consumer.setViewportSize({ width: 390, height: 900 });
    await search(products[1].name);
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await search("nothing-matches-this-homepage-query");
    await expect(consumer.getByText("0 個團購可加入", { exact: true })).toBeVisible();
    await expect(consumer.getByText("找不到符合條件的團購", { exact: true })).toBeVisible();
    await consumer.screenshot({ path: info.outputPath("home-no-results-390.png"), fullPage: true });
    await search(suffix);
    await consumer.getByRole("navigation", { name: "商品分類" }).getByRole("link", { name: categories[0], exact: true }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await consumer.getByRole("navigation", { name: "商品分類" }).getByRole("link", { name: categories[1], exact: true }).click();
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await consumer.getByRole("link", { name: "全部", exact: true }).click();
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await consumer.getByRole("combobox", { name: "排序", exact: true }).press("Home");
    await consumer.getByRole("combobox", { name: "排序", exact: true }).press("Enter");
    await expect(list.getByRole("heading", { level: 3 })).toHaveText([groups[2].title, groups[1].title, groups[0].title]);
    await consumer.goto(`/?q=${encodeURIComponent(suffix)}&view=featured`);
    await expect(consumer.getByRole("combobox", { name: "排序", exact: true })).toHaveValue("featured");
    await expect(list.getByRole("heading", { level: 3 })).toHaveText([groups[0].title, groups[1].title, groups[2].title]);
    await consumer.goto(`/?q=${encodeURIComponent(suffix)}&view=ended`);
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(consumer.getByText("暫無商品圖片", { exact: true })).toBeVisible();
    await consumer.screenshot({ path: info.outputPath("home-ended-390.png"), fullPage: true });
    await list.getByRole("link").click();
    await expect(consumer.getByText("已截止", { exact: true }).first()).toBeVisible();
    await expect(consumer.getByRole("button", { name: "加入購物車", exact: true })).toBeDisabled();

    // Hold and fail a real uploaded-image request to inspect stable loading/fallback.
    const imageUrl = (await db.groupBuyImage.findFirstOrThrow({ where: { groupBuyId: groups[0].id } })).imageUrl;
    let releaseImage!: () => void;
    const held = new Promise<void>(resolve => { releaseImage = resolve; });
    await consumer.route(`**${imageUrl}`, async route => { await held; await route.abort(); });
    await consumer.goto(`/?q=${encodeURIComponent(groups[0].title)}`, { waitUntil: "domcontentloaded" });
    await expect(consumer.getByText("圖片載入中", { exact: true })).toBeVisible();
    const imageBox = await list.getByRole("img").boundingBox();
    await consumer.screenshot({ path: info.outputPath("home-image-loading-390.png"), fullPage: true, timeout: 5000 });
    releaseImage();
    await expect(consumer.getByText("圖片暫時無法顯示", { exact: true })).toBeVisible();
    const fallbackBox = await consumer.getByText("圖片暫時無法顯示", { exact: true }).locator("..").boundingBox();
    expect(fallbackBox!.height).toBeCloseTo(imageBox!.height, 0);
    await consumer.screenshot({ path: info.outputPath("home-image-failure-390.png"), fullPage: true });
    await consumer.unroute(`**${imageUrl}`);
    await consumer.reload();
    await expect(list.getByRole("img")).toHaveClass(/opacity-100/);

    await consumer.goto(`/?q=${encodeURIComponent(groups[2].title)}`);
    await list.getByRole("link").click();
    await expect(consumer.getByRole("heading", { name: groups[2].title, exact: true })).toBeVisible();
    await expect(consumer.getByText(/本機首頁流程測試，所有商品與圖片均為自行產生的合成資料。/)).toBeVisible();
    await expect(consumer.getByText(/開團價格 NT\$259/)).toBeVisible();
    await consumer.getByRole("spinbutton", { name: "數量", exact: true }).fill("2");
    await inspectUi(consumer);
    await consumer.screenshot({ path: info.outputPath("home-product-390.png"), fullPage: true });

    for (const group of [groups[0], groups[1]]) {
      await consumer.goto(`/?q=${encodeURIComponent(group.title)}`);
      await list.getByRole("link").click();
      await expect(consumer.locator('[data-testid="group-buy-gallery-image"]')).toBeVisible();
      await consumer.getByRole("button", { name: "加入購物車", exact: true }).click();
      await expect(consumer.getByRole("status")).toContainText("已加入購物車");
      if (group === groups[1]) {
        await consumer.getByRole("combobox", { name: "商品規格", exact: true }).selectOption({ index: 1 });
        await consumer.getByRole("button", { name: "加入購物車", exact: true }).click();
        await expect(consumer.getByRole("status")).toContainText("已加入購物車");
      }
    }
    await consumer.goto(`/?q=${encodeURIComponent(suffix)}`);
    await expect(consumer.getByRole("link", { name: "購物車", exact: true }).locator(".qbuy-cart-count")).toHaveText("3");
    await consumer.getByRole("link", { name: "購物車", exact: true }).click();
    await expect(consumer.getByRole("article")).toHaveCount(3);
    const firstItem = consumer.getByRole("article").first();
    await firstItem.getByRole("spinbutton").fill("2");
    await expect(consumer.getByText("有效商品小計 NT$1096", { exact: true })).toBeVisible();
    await firstItem.getByRole("button", { name: "移除", exact: true }).click();
    await expect(consumer.getByRole("article")).toHaveCount(2);
    await inspectUi(consumer);
    await consumer.screenshot({ path: info.outputPath("home-cart-390.png"), fullPage: true });
    const account = await db.customerAccount.create({ data: { lineUserId: randomUUID(), displayName: "首頁驗收顧客", pictureUrl: imageUrl, lastLoginAt: new Date() } });
    const token = randomBytes(32).toString("base64url");
    await db.customerSession.create({ data: { customerAccountId: account.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
    await consumerContext.addCookies([{ name: "customer_session", value: token, url: "http://localhost:3100", httpOnly: true, sameSite: "Lax" }]);
    // Synthetic settings in the disposable DB; payment and external notifications never run.
    await db.checkoutSettings.upsert({ where: { id: "default" }, create: { id: "default", bankName: "本機合成銀行", bankCode: "000", bankAccount: "00000000", accountName: "合成測試", enabled: true }, update: { enabled: true } });
    await db.shippingRate.upsert({ where: { method_temperature: { method: "HOME_DELIVERY", temperature: "AMBIENT" } }, create: { method: "HOME_DELIVERY", temperature: "AMBIENT", enabled: true, fee: 60, maxWeightGrams: 100000, maxLengthMm: 1000, maxWidthMm: 1000, maxHeightMm: 1000, capabilityEvidence: "本機合成能力" }, update: { enabled: true, fee: 60, maxWeightGrams: 100000, maxLengthMm: 1000, maxWidthMm: 1000, maxHeightMm: 1000 } });
    await consumer.reload();
    await consumer.getByRole("link", { name: "前往跨團結帳", exact: true }).click();
    await consumer.getByLabel("收件人姓名", { exact: true }).fill("本機驗收顧客");
    await consumer.getByLabel("手機", { exact: true }).fill("0912345678");
    await consumer.getByLabel("配送方式", { exact: true }).selectOption("HOME_DELIVERY");
    await consumer.getByLabel("宅配地址", { exact: true }).fill("臺北市合成測試區驗收路 1 號");
    await consumer.getByRole("button", { name: "計算配送與總額", exact: true }).click();
    await expect(consumer.getByRole("button", { name: "確認金額並前往付款", exact: true })).toBeEnabled();
    await consumer.getByRole("button", { name: "確認金額並前往付款", exact: true }).click();
    await expect(consumer).toHaveURL(/\/checkout\/[a-f0-9-]+$/);
    const checkoutId = new URL(consumer.url()).pathname.split("/").at(-1)!;
    const checkout = await db.checkout.findUniqueOrThrow({ where: { id: checkoutId }, include: { items: true } });
    expect(checkout.items).toHaveLength(2);
    await expect(consumer.getByText("銀行轉帳", { exact: false }).first()).toBeVisible();
    await consumer.screenshot({ path: info.outputPath("home-purchase-390.png"), fullPage: true });
    await consumer.getByRole("navigation", { name: "顧客導航" }).getByRole("link", { name: "我的訂單", exact: true }).click();
    await expect(consumer.getByRole("link", { name: /本次購買/ })).toHaveCount(1);
    await consumer.getByRole("link", { name: /本次購買/ }).click();
    await expect(consumer.getByText("臺北市合成測試區驗收路 1 號", { exact: false })).toBeVisible();
    await inspectUi(consumer);
    await consumer.goto(`/?q=${encodeURIComponent(groups[0].title)}`);
    await list.getByRole("link").click();
    await consumer.getByRole("button", { name: "加入購物車", exact: true }).click();
    await expect(consumer.getByRole("status")).toContainText("已加入購物車");
    for (const width of [1440, 1280, 1024, 768, 390, 360, 320]) {
      await consumer.setViewportSize({ width, height: 900 });
      await consumer.goto(`/?q=${encodeURIComponent(suffix)}`);
      await expect(list.getByRole("img").first()).toHaveClass(/opacity-100/);
      const nav = consumer.getByRole("navigation", { name: "顧客導航" });
      await expect(nav.getByRole("link", { name: "購物車", exact: true }).locator(".qbuy-cart-count")).toHaveText("1");
      await expect(nav.getByRole("link", { name: "我的訂單", exact: true })).toBeVisible();
      const summary = consumer.locator("header summary");
      await expect(summary.locator("img")).toHaveAttribute("src", imageUrl);
      expect(await summary.locator("img").evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      await expect(summary).toHaveAccessibleName("首頁驗收顧客，帳號選單");
      await consumer.evaluate(() => scrollTo(0, 120));
      expect((await consumer.locator("header").boundingBox())!.y).toBe(0);
      await summary.press("Enter");
      await expect(nav.getByRole("button", { name: "登出", exact: true })).toBeVisible();
      expect(await consumer.locator(".qbuy-account-menu").evaluate(menu => {
        const bounds = menu.getBoundingClientRect();
        return menu.contains(document.elementFromPoint(bounds.left + 10, bounds.top + 10));
      })).toBe(true);
      await consumer.screenshot({ path: info.outputPath(`header-sticky-${width}.png`) });
      await consumer.screenshot({ path: info.outputPath(`home-account-open-${width}.png`), fullPage: true });
      await summary.press("Escape");
      await expect(consumer.locator("header details")).not.toHaveAttribute("open");
      await expect(summary).toBeFocused();
      await consumer.evaluate(() => scrollTo(0, 0));
      await summary.press("Enter");
      await consumer.getByRole("heading", { name: "找團購", exact: true }).click({ position: { x: 5, y: 5 } });
      await expect(consumer.locator("header details")).not.toHaveAttribute("open");
      await inspectUi(consumer, { expandDetails: false });
      if (width === 1440) {
        const card = list.getByRole("listitem").first().getByRole("link", { name: groups[2].title, exact: true });
        await card.hover();
        await expect(card).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, -2)");
        const cta = card;
        await consumer.keyboard.press("Tab");
        await cta.focus();
        await expect(cta).toHaveCSS("outline-width", "2px");
        await consumer.mouse.move(0, 0);
        await consumer.getByRole("heading", { name: "找團購", exact: true }).click({ position: { x: 5, y: 5 } });
        await expect(card).toHaveCSS("transform", "none");
      }
      await consumer.screenshot({ path: info.outputPath(`home-signed-in-${width}.png`), fullPage: true });
    }
    await consumer.locator("header summary").click();
    await consumer.getByRole("button", { name: "登出", exact: true }).click();
    await expect(consumer.getByRole("link", { name: "LINE 登入", exact: true })).toBeVisible();
    await expect(consumer.getByRole("link", { name: "購物車", exact: true }).locator(".qbuy-cart-count")).toHaveText("1");
    expect(await db.customerSession.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } })).toBeNull();
    await consumer.getByRole("link", { name: "購物車", exact: true }).click();
    await expect(consumer.getByRole("article")).toHaveCount(1);
    expect(errors).toEqual([]);
    records.push({ fixtures: groups, filters: "keyword, product name, empty, category switching, all, real latest select and preserved featured/ended URLs without homepage links", cart: "read-only quantity badge; 3 offers including both SKUs; quantity and confirmed removal; checkout persisted with 2 items; cart retained after logout", account: "desktop/mobile identity, Enter, Escape, outside click, POST logout and DB session revocation", checkoutId, errors });
  } finally {
    await writeFile(info.outputPath("home-results.json"), JSON.stringify(records, null, 2));
    await consumerContext.close();
    await db.$disconnect();
  }
});
