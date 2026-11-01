import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const m = JSON.parse(readFileSync(".temp/adm-preview/manifest.json", "utf8")) as { scenarios: { index: number; checkoutId: string; scenario: string }[] };
async function login(page: Page) {
  await page.goto("/admin/login"); await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL!); await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD!); await page.getByRole("button", { name: "登入", exact: true }).click(); await expect(page).toHaveURL(/\/admin$/);
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
for (const width of [320, 375, 390, 768, 1024, 1440]) {
  test(`ADM ${width}px: work overview, drawer, lists, filters and detail`, async ({ browser }, info) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 1024, isMobile: width < 768 });
    const page = await context.newPage(); const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await login(page); await expect(page.getByRole("heading", { name: "工作總覽", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /今日新增購買/ })).toContainText("筆購買"); await noOverflow(page);
    await page.addStyleTag({ content: "nextjs-portal{display:none}" });
    await page.screenshot({ path: info.outputPath(`dashboard-${width}.png`), fullPage: true, animations: "disabled", caret: "initial" });
    if (width < 1024) {
      const opener = page.getByRole("button", { name: "開啟管理選單" }); await opener.click();
      const dialog = page.getByRole("dialog", { name: "管理選單" }); await expect(dialog).toBeVisible();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
      await page.keyboard.press("Shift+Tab"); expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
      await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible(); await expect(opener).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
      await opener.click(); await dialog.getByRole("link", { name: "訂單管理", exact: true }).click(); await expect(dialog).not.toBeVisible();
    } else await page.getByRole("navigation", { name: "管理後台導覽" }).getByRole("link", { name: "訂單管理", exact: true }).click();
    await expect(page.getByTestId("purchase-row")).toHaveCount(20); await expect(page.getByRole("status")).toContainText("30 筆購買紀錄"); await noOverflow(page);
    await page.addStyleTag({ content: "nextjs-portal{display:none}" });
    await page.screenshot({ path: info.outputPath(`purchases-${width}.png`), fullPage: false, animations: "disabled", caret: "initial" });
    await page.getByRole("link", { name: "下一頁", exact: true }).click(); await expect(page.getByTestId("purchase-row")).toHaveCount(10);
    const search = page.getByLabel("搜尋編號、顧客、電話、商品或團購"); await search.fill("已入帳"); await page.getByRole("button", { name: "套用查詢" }).click();
    await expect(page.getByRole("status")).toContainText("1 筆購買紀錄");
    await page.getByRole("link", { name: "查看詳情", exact: true }).click(); await expect(page.getByRole("heading", { name: "購買與訂單詳情" })).toBeVisible();
    await expect(page.getByRole("button", { name: "建立全部正式 QB 訂單" })).toBeVisible(); await noOverflow(page);
    await page.getByRole("link", { name: "← 返回查詢結果" }).click(); await expect(search).toHaveValue("已入帳");
    await search.fill("ZZZ沒有這筆訂單"); await page.getByRole("button", { name: "套用查詢" }).click(); await expect(page.getByText("目前沒有符合條件的紀錄")).toBeVisible();
    await page.getByRole("link", { name: "清除條件", exact: true }).click(); await expect(search).toHaveValue(""); await expect(page.getByTestId("purchase-row")).toHaveCount(20); await page.getByRole("navigation", { name: "交易類型" }).getByRole("link", { name: "正式訂單", exact: true }).click();
    await expect(page.getByTestId("order-row")).toHaveCount(20); await expect(page.getByTestId("purchase-row")).toHaveCount(0); await noOverflow(page);
    const id = m.scenarios.find(r => r.index === 18)!.checkoutId; await page.goto(`/admin/qbuy/${id}`);
    await expect(page.getByRole("button", { name: "核准取消", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "核實並建立物流", exact: true })).toHaveCount(0);
    await page.locator("details").evaluateAll(nodes => nodes.forEach(n => { (n as HTMLDetailsElement).open = true; })); await noOverflow(page);
    await page.addStyleTag({ content: "nextjs-portal{display:none}" });
    await page.screenshot({ path: info.outputPath(`detail-${width}.png`), fullPage: true, animations: "disabled", caret: "initial" });
    expect(errors).toEqual([]); await context.close();
  });
}
test("drawer closes on breakpoint changes and rapid close/reopen without trapping desktop focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await login(page);
  const opener = page.getByRole("button", { name: "開啟管理選單" });
  for (let i = 0; i < 3; i++) { await opener.click(); await page.getByRole("button", { name: "關閉管理選單", exact: true }).click(); await expect(opener).toBeFocused(); }
  await opener.click(); await page.setViewportSize({ width: 1440, height: 900 }); await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  await page.getByRole("navigation", { name: "管理後台導覽" }).getByRole("link", { name: "訂單管理", exact: true }).focus(); await page.keyboard.press("Enter"); await expect(page).toHaveURL(/\/admin\/qbuy/);
});
test("all seeded work states render the real legal service results, and routes require admin", async ({ page, browser }) => {
  await login(page);
  for (const r of m.scenarios) {
    await page.goto(`/admin/qbuy/${r.checkoutId}`); await expect(page.getByRole("heading", { name: "購買與訂單詳情" })).toBeVisible();
    await expect(page.locator("#summary")).toContainText(r.scenario); await noOverflow(page);
  }
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole("navigation",{name:"管理後台導覽"}).getByRole("link",{name:"銀行與配送設定",exact:true}).click();
  await expect(page.locator("#settings")).toHaveAttribute("open", "");
  for(const url of ["/admin/products","/admin/commerce","/admin/group-buys","/admin/suppliers","/admin/pickup-locations","/admin/operations","/admin/qbuy/notifications"]){const response=await page.goto(url);expect(response?.status()).toBe(200);await noOverflow(page);}
  await page.goto(`/admin/qbuy/invalid-id`); await expect(page.getByText("找不到這筆購買紀錄", { exact: true })).toBeVisible();
  const anonymous = await browser.newPage(); await anonymous.goto(`/admin/qbuy/${m.scenarios[0].checkoutId}`); await expect(anonymous).toHaveURL(/\/admin\/login/); await anonymous.close();
});
