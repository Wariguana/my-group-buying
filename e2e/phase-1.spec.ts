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
  const startAt = taipeiDateTimeLocal(-1);
  const endAt = taipeiDateTimeLocal(48);
  const pickupStartAt = taipeiDateTimeLocal(72);
  const pickupEndAt = taipeiDateTimeLocal(96);

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
  await expect(page.getByRole("heading", { name: "營運首頁" })).toBeVisible();

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
  await page.getByRole("checkbox", { name: /7-ELEVEN 門市取貨/ }).check();
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
  const groupBuyDetailUrl = publicPage.url();
  await expect(detail.getByRole("heading", { name: productName })).toBeVisible();
  await expect(detail.getByText("箱", { exact: true })).toBeVisible();
  await expect(detail.getByText(new Intl.NumberFormat("zh-TW", {
    style: "currency", currency: "TWD", maximumFractionDigits: 0,
  }).format(399), { exact: true })).toBeVisible();
  await expect(detail.getByText("剩餘 24", { exact: true })).toBeVisible();
  await expect(detail.getByText("每人限購 3", { exact: true })).toBeVisible();
  await expect(detail.getByRole("heading", { name: pickupName })).toBeVisible();
  await expect(detail.getByLabel("取貨方式").getByText(pickupAddress, { exact: true })).toBeVisible();
  await expect(detail.getByText(`訂購期間：${taipeiDisplay(startAt)}－${taipeiDisplay(endAt)}`)).toBeVisible();
  await expect(detail.getByText(`取貨時間：${taipeiDisplay(pickupStartAt)}－${taipeiDisplay(pickupEndAt)}`)).toBeVisible();
  await expect(detail).not.toContainText(supplierName);
  await expect(detail.getByText("173", { exact: true })).toHaveCount(0);
  await expect(detail.getByText("成本", { exact: true })).toHaveCount(0);

  await detail.getByLabel("訂購人姓名").fill("公開訂購測試");
  await detail.getByLabel("手機號碼").fill("0912-345-678");
  await detail.getByRole("radio", { name: new RegExp(pickupName) }).check();
  await detail.getByLabel(`${productName}數量`).fill("2");
  await detail.getByRole("button", { name: "送出訂單" }).click();
  const confirmation = detail.getByRole("status");
  await expect(confirmation.getByRole("heading", { name: "訂購成功" })).toBeVisible();
  await expect(confirmation).toContainText(/ord-[A-Za-z0-9_-]{16}/);
  await expect(confirmation).toContainText(new Intl.NumberFormat("zh-TW", {
    style: "currency", currency: "TWD", maximumFractionDigits: 0,
  }).format(798));
  await expect(confirmation).toContainText("訂單管理碼");
  await expect(confirmation).toContainText("等同訂單管理密碼");
  await expect(confirmation).toContainText("不能作為管理憑證");
  const confirmationText = await confirmation.textContent();
  const publicCode = confirmationText?.match(/ord-[A-Za-z0-9_-]{16}/)?.[0];
  const managementCode = confirmationText?.match(/[A-Za-z0-9_-]{43}/)?.[0];
  expect(publicCode).toBeTruthy();
  expect(managementCode).toBeTruthy();
  await expect(detail.getByRole("button", { name: "送出訂單" })).toHaveCount(0);

  await confirmation.getByRole("link", { name: "查看訂單" }).click();
  await expect(publicPage).toHaveURL(new RegExp(`/orders/${publicCode}$`));
  await expect(publicPage.getByRole("heading", { name: publicCode! })).toBeVisible();
  await expect(publicPage.getByText(productName, { exact: true })).toBeVisible();
  await expect(publicPage.getByText(/× 2/)).toBeVisible();
  await expect(publicPage.getByText(pickupName, { exact: true })).toBeVisible();
  await expect(publicPage.getByText("PLACED", { exact: true })).toBeVisible();
  await expect(publicPage.getByText(`訂單總額：${new Intl.NumberFormat("zh-TW", {
    style: "currency", currency: "TWD", maximumFractionDigits: 0,
  }).format(798)}`, { exact: true })).toBeVisible();

  const recoveryContext = await browser.newContext();
  const recoveryPage = await recoveryContext.newPage();
  await recoveryPage.goto(`/orders/${publicCode}`);
  await expect(recoveryPage.getByLabel("訂單管理碼")).toBeVisible();
  await expect(recoveryPage.getByText(productName, { exact: true })).toHaveCount(0);
  await expect(recoveryPage.getByRole("button", { name: "取消訂單" })).toHaveCount(0);
  await recoveryPage.getByLabel("訂單管理碼").fill("B".repeat(43));
  await recoveryPage.getByRole("button", { name: "查看訂單" }).click();
  await expect(recoveryPage.getByText("找不到訂單或訂單管理憑證無效。", { exact: true })).toBeVisible();
  await expect(recoveryPage.getByText(productName, { exact: true })).toHaveCount(0);
  await expect(recoveryPage.getByRole("button", { name: "取消訂單" })).toHaveCount(0);
  await recoveryPage.getByLabel("訂單管理碼").fill(managementCode!);
  await recoveryPage.getByRole("button", { name: "查看訂單" }).click();
  await expect(recoveryPage).toHaveURL(new RegExp(`/orders/${publicCode}$`));
  await expect(recoveryPage.getByText(productName, { exact: true })).toBeVisible();
  await expect(recoveryPage.getByText("PLACED", { exact: true })).toBeVisible();
  await recoveryContext.close();

  await expect(publicPage.getByText(/可取消訂單/)).toBeVisible();
  await expect(publicPage.getByText(/截止時間/)).toBeVisible();
  await expect(publicPage.getByText("取消後無法復原。", { exact: true })).toBeVisible();
  publicPage.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("取消後無法復原");
    await dialog.accept();
  });
  await publicPage.getByRole("button", { name: "取消訂單" }).click();
  await expect(publicPage.getByText("CANCELLED", { exact: true })).toBeVisible();
  await expect(publicPage.getByRole("button", { name: "取消訂單" })).toHaveCount(0);
  const cancellationStatus = publicPage.getByRole("status");
  await expect(cancellationStatus).toContainText("訂單已取消。取消時間：");
  const cancellationText = await cancellationStatus.textContent();
  const displayedCancellationTime = cancellationText?.split("取消時間：")[1]?.trim();
  expect(displayedCancellationTime).toBeTruthy();

  await publicPage.goto(groupBuyDetailUrl);
  await expect(publicPage.getByText("剩餘 24", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "訂單管理" }).click();
  const adminOrder = page.getByRole("row").filter({ hasText: publicCode! });
  await expect(adminOrder).toBeVisible();
  await expect(adminOrder).toContainText("CANCELLED");
  await adminOrder.getByRole("link", { name: "查看訂單" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/orders/${publicCode}$`));
  await expect(page.getByRole("heading", { name: publicCode! })).toBeVisible();
  await expect(page.getByText("公開訂購測試", { exact: true })).toBeVisible();
  await expect(page.getByText(productName, { exact: true })).toBeVisible();
  await expect(page.getByText(/× 2/)).toBeVisible();
  await expect(page.getByText(`訂單總額：${new Intl.NumberFormat("zh-TW", {
    style: "currency", currency: "TWD", maximumFractionDigits: 0,
  }).format(798)}`, { exact: true })).toBeVisible();
  await expect(page.getByText(pickupName, { exact: true })).toBeVisible();
  await expect(page.getByText(pickupAddress, { exact: true })).toBeVisible();
  await expect(page.getByText("CANCELLED", { exact: true })).toBeVisible();
  await expect(page.getByText("取消時間", { exact: true }).locator("..")).toContainText(displayedCancellationTime!);

  // Independent second order exercises Admin cancellation while preserving
  // the complete customer-cancellation path above.
  await publicPage.goto(groupBuyDetailUrl);
  await publicPage.getByLabel("訂購人姓名").fill("管理員取消測試");
  await publicPage.getByLabel("手機號碼").fill("0922-345-678");
  await publicPage.getByRole("radio", { name: new RegExp(pickupName) }).check();
  await publicPage.getByLabel(`${productName}數量`).fill("2");
  await publicPage.getByRole("button", { name: "送出訂單" }).click();
  const adminConfirmation = publicPage.getByRole("status");
  await expect(adminConfirmation.getByRole("heading", { name: "訂購成功" })).toBeVisible();
  const adminConfirmationText = await adminConfirmation.textContent();
  const adminPublicCode = adminConfirmationText?.match(/ord-[A-Za-z0-9_-]{16}/)?.[0];
  const adminOrderToken = adminConfirmationText?.match(/[A-Za-z0-9_-]{43}/)?.[0];
  expect(adminPublicCode).toBeTruthy();
  expect(adminOrderToken).toBeTruthy();
  await adminConfirmation.getByRole("link", { name: "查看訂單" }).click();
  const customerOrderUrl = publicPage.url();
  await expect(publicPage.getByText("PLACED", { exact: true })).toBeVisible();
  await publicPage.goto(groupBuyDetailUrl);
  await expect(publicPage.getByText("剩餘 22", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "訂單管理", exact: true }).click();
  await page.getByRole("row").filter({ hasText: adminPublicCode! }).getByRole("link", { name: "查看訂單" }).click();
  await expect(page.getByText("PLACED", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(adminOrderToken!);
  await expect(page.locator("body")).not.toContainText("accessTokenHash");
  await expect(page.getByText("取消後無法復原。", { exact: true })).toBeVisible();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("取消後無法復原");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "取消訂單", exact: true }).click();
  await expect(page.getByText("CANCELLED", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "取消訂單", exact: true })).toHaveCount(0);
  const adminCancellationTime = page.getByText("取消時間", { exact: true }).locator("..");
  await expect(adminCancellationTime).toContainText(/\d{4}\/\d{2}\/\d{2}/);
  const storedAdminCancellationTime = await adminCancellationTime.textContent();
  await page.reload();
  await expect(page.getByText("取消時間", { exact: true }).locator("..")).toHaveText(storedAdminCancellationTime!);
  await publicPage.reload();
  await expect(publicPage.getByText("剩餘 24", { exact: true })).toBeVisible();
  await publicPage.goto(customerOrderUrl);
  await expect(publicPage.getByText("CANCELLED", { exact: true })).toBeVisible();
  await expect(publicPage.getByRole("button", { name: "取消訂單" })).toHaveCount(0);
  await expect(publicPage.getByText("取消時間", { exact: true }).locator("..")).toHaveText(storedAdminCancellationTime!);

  // Third independent order preserves both existing cancellation flows.
  await publicPage.goto(groupBuyDetailUrl);
  await publicPage.getByLabel("訂購人姓名").fill("管理員取貨測試");
  await publicPage.getByLabel("手機號碼").fill("0933-345-678");
  await publicPage.getByRole("radio", { name: new RegExp(pickupName) }).check();
  await publicPage.getByLabel(`${productName}數量`).fill("2");
  await publicPage.getByRole("button", { name: "送出訂單" }).click();
  const pickupConfirmation = publicPage.getByRole("status");
  await expect(pickupConfirmation.getByRole("heading", { name: "訂購成功" })).toBeVisible();
  const pickupText = await pickupConfirmation.textContent();
  const pickupCode = pickupText?.match(/ord-[A-Za-z0-9_-]{16}/)?.[0];
  const pickupToken = pickupText?.match(/[A-Za-z0-9_-]{43}/)?.[0];
  expect(pickupCode).toBeTruthy();
  expect(pickupToken).toBeTruthy();
  await pickupConfirmation.getByRole("link", { name: "查看訂單" }).click();
  const pickupCustomerUrl = publicPage.url();
  await publicPage.goto(groupBuyDetailUrl);
  await expect(publicPage.getByText("剩餘 22", { exact: true })).toBeVisible();
  await page.goto(`/admin/orders/${pickupCode}`);
  await expect(page.getByText("PLACED", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(pickupToken!);
  await expect(page.locator("body")).not.toContainText("accessTokenHash");
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("取貨後無法復原，且無法取消訂單");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "標記已取貨", exact: true }).click();
  const pickupTime = page.getByText(/^已取貨：/);
  await expect(pickupTime).toContainText(/\d{4}\/\d{2}\/\d{2}/);
  const storedPickupTime = await pickupTime.textContent();
  await expect(page.getByRole("button", { name: "標記已取貨", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "取消訂單", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/^已取貨：/)).toHaveText(storedPickupTime!);
  await page.goto("/admin/orders");
  await expect(page.getByRole("row").filter({ hasText: pickupCode! })).toContainText("已取貨");
  await publicPage.goto(pickupCustomerUrl);
  await expect(publicPage.getByText(/^已取貨：/)).toHaveText(storedPickupTime!);
  await expect(publicPage.getByText("訂單已取貨，無法取消。", { exact: true })).toBeVisible();
  await expect(publicPage.getByRole("button", { name: "取消訂單", exact: true })).toHaveCount(0);
  await publicPage.goto(groupBuyDetailUrl);
  await expect(publicPage.getByText("剩餘 22", { exact: true })).toBeVisible();
  // Fourth independent order exercises payment without replacing earlier flows.
  await publicPage.goto(groupBuyDetailUrl);
  await publicPage.getByLabel("訂購人姓名").fill("管理員收款測試");
  await publicPage.getByLabel("手機號碼").fill("0944-345-678");
  await publicPage.getByRole("radio", { name: new RegExp(pickupName) }).check();
  await publicPage.getByLabel(`${productName}數量`).fill("3");
  await publicPage.getByRole("button", { name: "送出訂單" }).click();
  const paymentConfirmation = publicPage.getByRole("status");
  await expect(paymentConfirmation.getByRole("heading", { name: "訂購成功" })).toBeVisible();
  const paymentText = await paymentConfirmation.textContent();
  const paymentCode = paymentText?.match(/ord-[A-Za-z0-9_-]{16}/)?.[0];
  const paymentToken = paymentText?.match(/[A-Za-z0-9_-]{43}/)?.[0];
  expect(paymentCode).toBeTruthy();
  expect(paymentToken).toBeTruthy();
  await paymentConfirmation.getByRole("link", { name: "查看訂單" }).click();
  const paymentCustomerUrl = publicPage.url();
  await expect(publicPage.getByText("付款：尚未確認收款", { exact: true })).toBeVisible();
  await publicPage.goto(groupBuyDetailUrl);
  await expect(publicPage.getByText("剩餘 19", { exact: true })).toBeVisible();

  await page.goto(`/admin/orders/${paymentCode}`);
  await expect(page.getByText("付款：尚未確認收款", { exact: true })).toBeVisible();
  await expect(page.getByText("應收總額：$1,197", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(paymentToken!);
  await expect(page.locator("body")).not.toContainText("accessTokenHash");
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("已全額收款 $1,197");
    expect(dialog.message()).toContain("無法復原，且無法取消訂單");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "確認已收款", exact: true }).click();
  await expect(page.getByText("付款：已收款", { exact: true })).toBeVisible();
  const paymentTime = page.getByText(/^收款確認時間：/);
  await expect(paymentTime).toContainText(/\d{4}\/\d{2}\/\d{2}/);
  const storedPaymentTime = await paymentTime.textContent();
  await expect(page.getByRole("button", { name: "確認已收款", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "取消訂單", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "標記已取貨", exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByText(/^收款確認時間：/)).toHaveText(storedPaymentTime!);
  await page.goto("/admin/orders");
  const paidListOrder = page.getByRole("row").filter({ hasText: paymentCode! });
  await expect(paidListOrder).toContainText("付款：已收款");
  await expect(paidListOrder).toContainText("待取貨");
  await publicPage.goto(paymentCustomerUrl);
  await expect(publicPage.getByText("付款：已收款", { exact: true })).toBeVisible();
  await expect(publicPage.getByText(/^收款確認時間：/)).toHaveText(storedPaymentTime!);
  await expect(publicPage.getByText("訂單已確認收款，無法取消。", { exact: true })).toBeVisible();
  await expect(publicPage.getByRole("button", { name: "取消訂單", exact: true })).toHaveCount(0);
  await expect(publicPage.getByRole("button", { name: "確認已收款", exact: true })).toHaveCount(0);

  await publicPage.goto(groupBuyDetailUrl);
  await expect(publicPage.getByText("剩餘 19", { exact: true })).toBeVisible();
  await publicPage.getByLabel("訂購人姓名").fill("管理員收款測試");
  await publicPage.getByLabel("手機號碼").fill("0944-345-678");
  await publicPage.getByRole("radio", { name: new RegExp(pickupName) }).check();
  await publicPage.getByLabel(`${productName}數量`).fill("1");
  await publicPage.getByRole("button", { name: "送出訂單" }).click();
  await expect(publicPage.getByRole("article").getByRole("alert")).toHaveText("訂購數量超過此商品的限購數量。");

  await page.goto(`/admin/orders/${paymentCode}`);
  page.once("dialog", async (dialog) => { await dialog.accept(); });
  await page.getByRole("button", { name: "標記已取貨", exact: true }).click();
  await expect(page.getByText(/^已取貨：/)).toContainText(/\d{4}\/\d{2}\/\d{2}/);
  const paidPickupTime = await page.getByText(/^已取貨：/).textContent();
  await expect(page.getByText(/^收款確認時間：/)).toHaveText(storedPaymentTime!);
  await publicPage.goto(paymentCustomerUrl);
  await expect(publicPage.getByText(/^收款確認時間：/)).toHaveText(storedPaymentTime!);
  await expect(publicPage.getByText(/^已取貨：/)).toHaveText(paidPickupTime!);
  await publicPage.goto(groupBuyDetailUrl);
  await expect(publicPage.getByText("剩餘 19", { exact: true })).toBeVisible();
  await publicPage.getByLabel("訂購人姓名").fill("管理員收款測試");
  await publicPage.getByLabel("手機號碼").fill("0944-345-678");
  await publicPage.getByRole("radio", { name: new RegExp(pickupName) }).check();
  await publicPage.getByLabel(`${productName}數量`).fill("1");
  await publicPage.getByRole("button", { name: "送出訂單" }).click();
  await expect(publicPage.getByRole("article").getByRole("alert")).toHaveText("訂購數量超過此商品的限購數量。");
  // A provider-shaped deterministic fixture exercises the callback and
  // authoritative server-side selection without reaching a third party.
  await publicPage.goto(groupBuyDetailUrl);
  await publicPage.getByRole("radio", { name: "7-ELEVEN 門市取貨", exact: true }).check();
  await publicPage.getByRole("button", { name: "選擇 7-ELEVEN 門市", exact: true }).click();
  await expect(publicPage.getByRole("heading", { name: "7-ELEVEN 測試門市" })).toBeVisible();
  await publicPage.getByRole("button", { name: "選擇測試 7-ELEVEN 門市" }).click();
  await expect(publicPage).toHaveURL(/\/group-buys\/gb-[A-Za-z0-9_-]+\?storeSelection=/);
  await expect(publicPage.getByText("7-ELEVEN 測試門市", { exact: true })).toBeVisible();
  await expect(publicPage.getByText("店號：991234", { exact: true })).toBeVisible();
  await expect(publicPage.getByText("地址：臺北市測試區安心路 7 號", { exact: true })).toBeVisible();
  await publicPage.getByLabel("訂購人姓名").fill("超商取貨測試");
  await publicPage.getByLabel("手機號碼").fill("0955-345-678");
  await publicPage.getByLabel(`${productName}數量`).fill("1");
  await publicPage.getByRole("button", { name: "送出訂單" }).click();
  const sevenElevenConfirmation = publicPage.getByRole("status");
  await expect(sevenElevenConfirmation.getByRole("heading", { name: "訂購成功" })).toBeVisible();
  const sevenElevenText = await sevenElevenConfirmation.textContent();
  const sevenElevenCode = sevenElevenText?.match(/ord-[A-Za-z0-9_-]{16}/)?.[0];
  expect(sevenElevenCode).toBeTruthy();
  await sevenElevenConfirmation.getByRole("link", { name: "查看訂單" }).click();
  await expect(publicPage.getByText("取貨方式：7-ELEVEN 門市取貨", { exact: true })).toBeVisible();
  await expect(publicPage.getByText("門市：測試門市", { exact: true })).toBeVisible();
  await expect(publicPage.getByText("店號：991234", { exact: true })).toBeVisible();

  await page.goto(`/admin/orders/${sevenElevenCode}`);
  await expect(page.getByText("7-ELEVEN 門市取貨", { exact: true })).toBeVisible();
  await expect(page.getByText("測試門市", { exact: true })).toBeVisible();
  await expect(page.getByText("991234", { exact: true })).toBeVisible();
  await expect(page.getByText("臺北市測試區安心路 7 號", { exact: true })).toBeVisible();
  await anonymous.close();
});
