import { test, expect } from "@playwright/test";

test("Admin forms expose server field errors, retain entered data and prevent repeat submits", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/admin/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill("WrongPassword-UX-Only");
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(process.env.E2E_ADMIN_EMAIL!);
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("aria-describedby", "login-error");
  await page.screenshot({ path: info.outputPath("login-error-390.png"), fullPage: true });
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  for (const item of [
    { route: "products", required: "商品名稱 *", preserved: "商品說明", button: "新增商品", error: "請輸入商品名稱。" },
    { route: "suppliers", required: "供應商名稱 *", preserved: "備註", button: "新增供應商", error: "請輸入供應商名稱。" },
    { route: "pickup-locations", required: "地點名稱 *", preserved: "說明", button: "新增取貨地點", error: "請輸入地點名稱。" },
    { route: "group-buys", required: "團購名稱 *", preserved: "說明", button: "建立草稿", error: "請輸入團購名稱。" },
  ]) {
    await page.goto(`/admin/${item.route}/new`);
    const submit = page.getByRole("button", { name: item.button, exact: true });
    expect(await submit.evaluate(element => (element as HTMLButtonElement).form!.checkValidity())).toBe(false);
    await page.getByLabel(item.required, { exact: true }).fill("   ");
    const marker = `輸入內容保留-${item.route}`;
    await page.getByLabel(item.preserved, { exact: true }).fill(marker);
    if (item.route === "products") {
      await page.getByLabel("預設售價 *", { exact: true }).fill("299");
      await page.getByLabel("預設成本 *", { exact: true }).fill("100");
      await page.getByLabel("單位 *", { exact: true }).fill("件");
    }
    if (item.route === "pickup-locations") await page.getByLabel("地址 *", { exact: true }).fill("臺北市測試區安心路 1 號");
    if (item.route === "group-buys") {
      await page.getByLabel("開始時間 *", { exact: true }).fill("2099-01-01T10:00");
      await page.getByLabel("結束時間 *", { exact: true }).fill("2099-01-02T10:00");
    }
    let requests = 0;
    await page.route(`**/admin/${item.route}/new`, async route => {
      if (route.request().method() === "POST") { requests++; await new Promise(resolve => setTimeout(resolve, 700)); }
      await route.continue();
    });
    await submit.click();
    await expect(page.getByRole("button", { name: "儲存中…", exact: true })).toBeDisabled();
    await page.screenshot({ path: info.outputPath(`${item.route}-saving-390.png`), fullPage: true });
    await expect(page.getByText(item.error, { exact: true })).toBeVisible();
    await expect(page.getByLabel(item.required, { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel(item.preserved, { exact: true })).toHaveValue(marker);
    expect(requests).toBe(1);
    await page.screenshot({ path: info.outputPath(`${item.route}-error-390.png`), fullPage: true });
    await page.unroute(`**/admin/${item.route}/new`);
  }
});
