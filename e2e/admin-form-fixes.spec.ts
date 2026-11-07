import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("mobile bank validation submits once, keeps drafts and blocks link/back navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page).toHaveURL("/admin");
  await mkdir(".temp/fixes-mobile-20261106", { recursive: true });
  await page.screenshot({ animations: "disabled", path: ".temp/fixes-mobile-20261106/01-overview-390.png" });
  for (const route of ["/admin/orders", "/admin/orders/ord-AbCdEf0123_-xyZ9", "/orders/ord-AbCdEf0123_-xyZ9", "/admin/pickup-locations", "/admin/pickup-locations/new", "/admin/pickup-locations/retired/edit"]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(404);
  }
  await page.goto("/admin/more");
  await expect(page.getByRole("link", { name: /舊制訂單/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /取貨地點/ })).toHaveCount(0);
  await page.screenshot({ animations: "disabled", path: ".temp/fixes-mobile-20261106/02-more-390.png" });
  await page.getByRole("link", { name: "銀行與配送設定 維護收款帳戶與配送選項" }).click();
  await expect(page).toHaveURL(/\/admin\/payments\?settings=1#settings$/);
  const settingsUrl = page.url();
  const form = page.getByRole("form", { name: "儲存銀行設定", exact: true });
  const writes: string[] = [];
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/api/checkout")) writes.push(request.url()); });
  await form.getByLabel("銀行名稱", { exact: true }).fill("QBUY 畫面驗收");
  await form.getByLabel("銀行代碼", { exact: true }).fill("12");
  await form.getByLabel("收款帳號", { exact: true }).fill("");
  await form.getByLabel("戶名", { exact: true }).fill(" ");
  await form.getByRole("button", { name: "儲存銀行設定", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText("請修正標示的欄位。");
  await expect(form.getByLabel("銀行代碼", { exact: true })).toBeFocused();
  await expect(form.getByLabel("銀行代碼", { exact: true })).toHaveAttribute("aria-invalid", "true");
  expect(writes).toHaveLength(0);
  await page.screenshot({ animations: "disabled", path: ".temp/fixes-mobile-20261106/03-bank-errors-390.png" });
  const messages: string[] = [];
  page.on("dialog", async dialog => { messages.push(dialog.message()); await dialog.dismiss(); });
  await page.getByRole("link", { name: "更多", exact: true }).click();
  expect(messages).toHaveLength(1);
  expect(messages[0]).toContain("銀行設定尚未儲存");
  await expect(page).toHaveURL(settingsUrl);
  await page.evaluate(() => history.back());
  await expect.poll(() => messages.length).toBe(2);
  await expect(page).toHaveURL(settingsUrl);
  await expect(form.getByLabel("銀行代碼", { exact: true })).toHaveValue("12");
});
