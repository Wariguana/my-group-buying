import { expect, test } from "@playwright/test";
import sharp from "sharp";
const productName = "台灣鳳梨箱";
const groupBuyTitle = "SKU 團購基本資料驗收";
function taipeiDateTimeLocal(hoursFromNow: number): string {
  const date = new Date(Math.ceil(Date.now() / 60_000) * 60_000 + hoursFromNow * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
test("admin catalogue and SKU group basic draft with ordered gallery", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("E2E credentials are not configured.");

  const supplierName = `E2E 私密供應商 ${Date.now()}`;
  const startAt = taipeiDateTimeLocal(-1);
  const endAt = taipeiDateTimeLocal(48);
  const firstImage = await sharp({ create: { width: 12, height: 8, channels: 3, background: "#ef4444" } }).png().toBuffer();
  const secondImage = await sharp({ create: { width: 8, height: 12, channels: 3, background: "#3b82f6" } }).jpeg().toBuffer();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "找團購" })).toBeVisible();
  await expect(page.getByText("目前沒有開放中的團購")).toBeVisible();
  await expect(page.getByText(groupBuyTitle, { exact: true })).toHaveCount(0);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "工作總覽" })).toBeVisible();

  await page.getByRole("link", { name: "供應商管理" }).click();
  await page.getByRole("link", { name: "新增供應商", exact: true }).click();
  await page.getByLabel("供應商名稱 *").fill(supplierName);
  await page.getByRole("button", { name: "新增供應商" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: supplierName })).toBeVisible();

  await page.getByRole("link", { name: "商品管理" }).click();
  await page.getByRole("link", { name: "新增商品", exact: true }).click();
  await page.getByLabel("商品名稱 *").fill(productName);
  await page.getByLabel("預設售價 *").fill("420");
  await page.getByLabel("預設成本 *").fill("173");
  await page.getByLabel("單位 *").fill("箱");
  await page.getByLabel("供應商").selectOption({ label: supplierName });
  await page.getByRole("button", { name: "新增商品" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: productName })).toContainText(supplierName);

  await page.getByRole("link", { name: "團購管理" }).click();
  await page.getByRole("link", { name: "新增團購草稿", exact: true }).click();
  await page.getByLabel("團購名稱 *").fill(groupBuyTitle);
  await page.getByLabel("說明").fill("E2E 新版 SKU 團購基本資料流程");
  await page.getByLabel("選擇圖片上傳").setInputFiles([
    { name: "first.png", mimeType: "image/png", buffer: firstImage },
    { name: "second.jpg", mimeType: "image/jpeg", buffer: secondImage },
  ]);
  await expect(page.getByAltText("商品圖片 1")).toBeVisible();
  await expect(page.getByAltText("商品圖片 2")).toBeVisible();
  await page.getByRole("button", { name: "圖片 2 上移" }).click();
  await expect(page.getByText("封面", { exact: true })).toBeVisible();
  await page.getByLabel("開始時間 *").fill(startAt);
  await page.getByLabel("結束時間 *").fill(endAt);
  await page.getByRole("button", { name: "建立草稿" }).click();
  const adminGroupBuy = page.getByRole("listitem").filter({ hasText: groupBuyTitle });
  await expect(adminGroupBuy).toContainText("草稿");

  await adminGroupBuy.getByRole("link", { name: "編輯草稿" }).click();
  await expect(page.getByRole("heading", { name: "商品規格與配送" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新增商品", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("團購名稱 *")).toHaveValue(groupBuyTitle);
  await expect(page.getByAltText("商品圖片 1")).toBeVisible();
  await page.getByRole("button", { name: "儲存草稿", exact: true }).click();
  await expect(adminGroupBuy).toContainText("SKU 販售規格 0 項");
});
