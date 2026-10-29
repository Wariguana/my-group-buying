import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

const operation = (page: Page | Locator, value: string) => page.locator(`form:has(input[name="operation"][value="${value}"])`);
async function save(form: Locator) { await form.getByRole("button", { name: "儲存", exact: true }).click(); await expect(form.getByRole("status")).toHaveText("已儲存。"); }
async function toggle(page: Page, name: string) {
  const row = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name, exact: true }) });
  page.once("dialog", dialog => dialog.dismiss());
  await row.getByRole("button", { name: "停用", exact: true }).click();
  await expect(row.getByText("啟用中", { exact: true })).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await row.getByRole("button", { name: "停用", exact: true }).click();
  await expect(row.getByText("已停用", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "啟用", exact: true }).click();
  await expect(row.getByText("啟用中", { exact: true })).toBeVisible();
}

test("catalog editors, cancellation of destructive actions, default SKU and complete inventory adjustments", async ({ page }, info) => {
  test.setTimeout(120000); page.setDefaultTimeout(15000);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/admin/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/suppliers/new");
  await page.getByLabel("供應商名稱 *", { exact: true }).fill("UX 操作供應商");
  await page.getByRole("button", { name: "新增供應商", exact: true }).click();
  await page.getByRole("listitem").filter({ hasText: "UX 操作供應商" }).getByRole("link", { name: "編輯", exact: true }).click();
  await page.getByLabel("聯絡人", { exact: true }).fill("合成聯絡人");
  await page.getByLabel("電話", { exact: true }).fill("0912345678");
  await page.getByRole("button", { name: "儲存變更", exact: true }).click();
  await toggle(page, "UX 操作供應商");

  await page.goto("/admin/pickup-locations/new");
  await page.getByLabel("地點名稱 *", { exact: true }).fill("UX 操作取貨點");
  await page.getByLabel("地址 *", { exact: true }).fill("臺北市測試區安心路 1 號");
  await page.getByRole("button", { name: "新增取貨地點", exact: true }).click();
  await page.getByRole("listitem").filter({ hasText: "UX 操作取貨點" }).getByRole("link", { name: "編輯", exact: true }).click();
  await page.getByLabel("說明", { exact: true }).fill("隔離測試取貨說明");
  await page.getByRole("button", { name: "儲存變更", exact: true }).click();
  await toggle(page, "UX 操作取貨點");

  await page.goto("/admin/products/new");
  await page.getByLabel("商品名稱 *", { exact: true }).fill("UX 操作商品");
  await page.getByLabel("預設售價 *", { exact: true }).fill("299");
  await page.getByLabel("預設成本 *", { exact: true }).fill("100");
  await page.getByLabel("單位 *", { exact: true }).fill("件");
  await page.getByLabel("供應商", { exact: true }).selectOption({ label: "UX 操作供應商" });
  await page.getByRole("button", { name: "新增商品", exact: true }).click();
  await page.getByRole("listitem").filter({ hasText: "UX 操作商品" }).getByRole("link", { name: "編輯", exact: true }).click();
  await page.getByLabel("商品說明", { exact: true }).fill("可維護的商品說明");
  await page.getByRole("button", { name: "儲存變更", exact: true }).click();
  await toggle(page, "UX 操作商品");

  page.on("dialog", dialog => dialog.accept());
  await page.goto("/admin/commerce");
  const productId = await page.locator('select[name="product"] option').filter({ hasText: "UX 操作商品" }).getAttribute("value");
  await page.locator('select[name="product"]').selectOption(productId!);
  await page.getByRole("button", { name: "管理商品 SKU", exact: true }).click();
  await operation(page, "defaultSku").getByRole("button", { name: "儲存", exact: true }).click();
  await expect(operation(page, "skuEdit")).toHaveCount(1);
  await page.getByRole("link", { name: "查看完整庫存流水帳", exact: true }).click();
  await expect(page.getByText("尚無庫存異動紀錄。", { exact: true })).toBeVisible();
  const emptyRecords = [];
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(width);
    const screenshot = `inventory-empty-${width}.png`;
    if ([320, 390, 768, 1440].includes(width)) await page.screenshot({ path: info.outputPath(screenshot), fullPage: true });
    emptyRecords.push({ route: "/admin/inventory/[skuId]", state: "empty", width, scrollWidth, screenshot: [320, 390, 768, 1440].includes(width) ? screenshot : null });
  }
  const { sourceDigest } = JSON.parse(await readFile("docs/ux-audit/inventory.json", "utf8"));
  await writeFile(info.outputPath("catalog-results.json"), JSON.stringify({ sourceDigest, records: emptyRecords }, null, 2));
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByRole("link", { name: "← 返回商品庫存", exact: true }).click();
  const inventory = operation(page, "inventory");
  await inventory.getByLabel("數量", { exact: true }).fill("20");
  await inventory.getByLabel("原因（至少 3 字）", { exact: true }).fill("隔離測試起始盤點");
  await inventory.getByLabel("已核實實體數量及舊單", { exact: true }).check();
  await save(inventory);
  for (const [kind, value, expected] of [["RESTOCK", "2", "可售 22"], ["REDUCE", "1", "可售 21"], ["COUNT", "15", "可售 15"]]) {
    await inventory.getByRole("combobox", { name: "操作", exact: true }).selectOption(kind);
    await inventory.getByLabel("數量", { exact: true }).fill(value);
    await inventory.getByLabel("原因（至少 3 字）", { exact: true }).fill(`隔離測試 ${kind}`);
    await inventory.getByLabel("已核實實體數量及舊單", { exact: true }).check();
    await save(inventory);
    await expect(page.getByText(new RegExp(expected))).toBeVisible();
  }
  const edit = operation(page, "skuEdit");
  await edit.getByLabel("顯示資訊", { exact: true }).fill("合成預設規格");
  await edit.getByRole("combobox", { name: "狀態", exact: true }).selectOption("false"); await save(edit);
  await edit.getByRole("combobox", { name: "狀態", exact: true }).selectOption("true"); await save(edit);
  await page.getByRole("link", { name: "查看完整庫存流水帳", exact: true }).click();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(4);
  await page.getByRole("region", { name: "完整庫存流水帳（可水平捲動）" }).focus();
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.screenshot({ path: info.outputPath("inventory-four-adjustments-320.png"), fullPage: true });
  await page.goto("/admin/commerce");
  const category = operation(page, "category").filter({ has: page.getByLabel("新增分類", { exact: true }) });
  await category.getByLabel("新增分類", { exact: true }).fill("UX 操作分類"); await save(category);
  const categoryId = await operation(page, "category").filter({ has: page.locator('input[name="name"][value="UX 操作分類"]') }).locator('input[name="id"]').getAttribute("value");
  const categoryEdit = operation(page, "category").filter({ has: page.locator(`input[name="id"][value="${categoryId}"]`) });
  await categoryEdit.getByLabel("分類名稱", { exact: true }).fill("UX 已改名分類");
  await categoryEdit.getByLabel("排序", { exact: true }).fill("9");
  await categoryEdit.getByRole("combobox", { name: "狀態", exact: true }).selectOption("false"); await save(categoryEdit);
  const renamed = operation(page, "category").filter({ has: page.locator(`input[name="id"][value="${categoryId}"]`) });
  await renamed.getByRole("combobox", { name: "狀態", exact: true }).selectOption("true"); await save(renamed);
  await page.goto("/admin/group-buys/new");
  await page.getByLabel("團購名稱 *", { exact: true }).fill("UX 販售狀態驗收");
  await page.getByLabel("開始時間 *", { exact: true }).fill("2020-01-01T10:00");
  await page.getByLabel("結束時間 *", { exact: true }).fill("2099-01-01T10:00");
  await page.getByRole("button", { name: "建立草稿", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/group-buys$/);
  await page.goto("/admin/commerce");
  const groupId = await page.locator('select[name="group"] option').filter({ hasText: "UX 販售狀態驗收" }).getAttribute("value");
  await page.locator('select[name="group"]').selectOption(groupId!);
  await page.getByRole("button", { name: "管理開團販售", exact: true }).click();
  const offer = operation(page, "offer").first();
  await offer.getByRole("combobox", { name: "SKU", exact: true }).selectOption(productId!);
  await offer.getByLabel("開團價格 NT$", { exact: true }).fill("279");
  await offer.getByLabel("每次購物數量上限（空白不限）", { exact: true }).fill("2"); await save(offer);
  const group = operation(page, "group");
  await group.getByRole("combobox", { name: "分類", exact: true }).selectOption(categoryId!);
  await group.getByRole("combobox", { name: "精選", exact: true }).selectOption("true");
  await group.getByRole("combobox", { name: "允許合併配送", exact: true }).selectOption("false");
  for (const visibility of ["PUBLISHED", "UNLISTED", "ARCHIVED"]) {
    await group.getByRole("combobox", { name: "展示狀態", exact: true }).selectOption(visibility); await save(group);
    await page.reload(); await expect(operation(page, "group").getByRole("combobox", { name: "展示狀態", exact: true })).toHaveValue(visibility);
  }
  await expect(page.getByText("目前：封存", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.screenshot({ path: info.outputPath("catalog-archived-320.png"), fullPage: true });
});
