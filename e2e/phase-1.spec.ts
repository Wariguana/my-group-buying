import { expect, test } from "@playwright/test";

const productName = "台灣鳳梨箱";
const pickupName = "中山社區活動中心";
const pickupAddress = "臺北市中山區民生東路一段 1 號";
const groupBuyTitle = "Phase 1 台灣鳳梨團購";

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

function taipeiDisplay(value: string): string {
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day, hour - 8, minute));
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
}

test("complete Phase 1 browser flow", async ({ browser, page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("E2E credentials are not configured.");

  const supplierName = `E2E 私密供應商 ${Date.now()}`;
  const startAt = taipeiDateTimeLocal(24);
  const endAt = taipeiDateTimeLocal(72);
  const pickupStartAt = taipeiDateTimeLocal(96);
  const pickupEndAt = taipeiDateTimeLocal(120);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "一起買，日常更簡單" })).toBeVisible();
  await expect(page.getByText("目前沒有可查看的團購。")).toBeVisible();
  await expect(page.getByText(groupBuyTitle, { exact: true })).toHaveCount(0);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("已登入管理後台。")).toBeVisible();

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

  await page.getByRole("link", { name: "取貨地點管理" }).click();
  await page.getByRole("link", { name: "新增取貨地點", exact: true }).click();
  await page.getByLabel("地點名稱 *").fill(pickupName);
  await page.getByLabel("地址 *").fill(pickupAddress);
  await page.getByRole("button", { name: "新增取貨地點" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: pickupName })).toContainText(pickupAddress);

  await page.getByRole("link", { name: "團購管理" }).click();
  await page.getByRole("link", { name: "新增團購草稿", exact: true }).click();
  await page.getByLabel("團購名稱 *").fill(groupBuyTitle);
  await page.getByLabel("說明").fill("E2E 完整 Phase 1 流程");
  await page.getByLabel("開始時間 *").fill(startAt);
  await page.getByLabel("結束時間 *").fill(endAt);
  await page.getByRole("button", { name: "建立草稿" }).click();
  const adminGroupBuy = page.getByRole("listitem").filter({ hasText: groupBuyTitle });
  await expect(adminGroupBuy).toContainText("草稿");

  const anonymous = await browser.newContext();
  const publicPage = await anonymous.newPage();
  await publicPage.goto("/");
  await expect(publicPage.getByText(groupBuyTitle, { exact: true })).toHaveCount(0);

  await adminGroupBuy.getByRole("link", { name: "編輯草稿" }).click();
  await page.getByRole("button", { name: "新增商品" }).click();
  await page.getByLabel("商品 1").selectOption({ label: `${productName}／箱` });
  await page.getByLabel("售價", { exact: true }).fill("399");
  await page.getByLabel("庫存（空白為不限）").fill("24");
  await page.getByLabel("每人限購（空白為不限）").fill("3");
  await page.getByRole("button", { name: "新增取貨地點" }).click();
  await page.getByLabel("取貨地點 1").selectOption({ label: `${pickupName}／${pickupAddress}` });
  await page.getByLabel("取貨開始時間").fill(pickupStartAt);
  await page.getByLabel("取貨結束時間").fill(pickupEndAt);
  await page.getByRole("button", { name: "儲存草稿" }).click();

  const savedGroupBuy = page.getByRole("listitem").filter({ hasText: groupBuyTitle });
  await expect(savedGroupBuy).toContainText("商品 1 項／取貨地點 1 處");
  await savedGroupBuy.getByRole("link", { name: "編輯草稿" }).click();
  await expect(page.getByLabel("商品 1").getByRole("option", {
    name: `${productName}／箱`, selected: true,
  })).toBeAttached();
  await expect(page.getByLabel("售價", { exact: true })).toHaveValue("399");
  await expect(page.getByLabel("庫存（空白為不限）")).toHaveValue("24");
  await expect(page.getByLabel("每人限購（空白為不限）")).toHaveValue("3");
  await expect(page.getByLabel("取貨地點 1").getByRole("option", {
    name: `${pickupName}／${pickupAddress}`, selected: true,
  })).toBeAttached();
  await expect(page.getByLabel("取貨開始時間")).toHaveValue(pickupStartAt);
  await expect(page.getByLabel("取貨結束時間")).toHaveValue(pickupEndAt);

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("確定要發布這個團購嗎");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "發布團購" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: groupBuyTitle })).toContainText("已發布");

  await publicPage.reload();
  const publicGroupBuy = publicPage.getByRole("listitem").filter({ hasText: groupBuyTitle });
  await expect(publicGroupBuy).toBeVisible();
  await publicGroupBuy.getByRole("link", { name: "查看團購" }).click();

  const detail = publicPage.getByRole("article");
  await expect(detail.getByRole("heading", { name: groupBuyTitle })).toBeVisible();
  await expect(detail.getByRole("heading", { name: productName })).toBeVisible();
  await expect(detail.getByText("箱", { exact: true })).toBeVisible();
  await expect(detail.getByText(new Intl.NumberFormat("zh-TW", {
    style: "currency", currency: "TWD", maximumFractionDigits: 0,
  }).format(399), { exact: true })).toBeVisible();
  await expect(detail.getByText("剩餘 24", { exact: true })).toBeVisible();
  await expect(detail.getByText("每人限購 3", { exact: true })).toBeVisible();
  await expect(detail.getByRole("heading", { name: pickupName })).toBeVisible();
  await expect(detail.getByText(pickupAddress, { exact: true })).toBeVisible();
  await expect(detail.getByText(`訂購期間：${taipeiDisplay(startAt)}－${taipeiDisplay(endAt)}`)).toBeVisible();
  await expect(detail.getByText(`取貨時間：${taipeiDisplay(pickupStartAt)}－${taipeiDisplay(pickupEndAt)}`)).toBeVisible();
  await expect(detail).not.toContainText(supplierName);
  await expect(detail.getByText("173", { exact: true })).toHaveCount(0);
  await expect(detail.getByText("成本", { exact: true })).toHaveCount(0);

  await anonymous.close();
});
