import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const m = JSON.parse(readFileSync(".temp/adm-preview/manifest.json", "utf8")) as { scenarios: { index: number; checkoutId: string; scenario: string }[] };
async function login(page: Page) {
  await page.goto("/admin/login"); await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL!); await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD!); await page.getByRole("button", { name: "登入", exact: true }).click(); await expect(page).toHaveURL(/\/admin$/);
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
async function showFilters(page: Page) {
  await expect(page.getByRole("heading", { name: "訂單管理", exact: true })).toBeVisible();
  const form = page.getByRole("form", { name: "訂單查詢條件", exact: true });
  const toggle = page.getByRole("button", { name: "調整查詢條件", exact: true });
  if (page.viewportSize()!.width < 1024 && !(await form.isVisible())) await toggle.click();
  await expect(form).toBeVisible();
}
for (const width of [320, 375, 390, 768, 910, 1024, 1440]) {
  test(`ADM ${width}px: work overview, More navigation, lists, filters and detail`, async ({ browser }, info) => {
    const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, hasTouch: width < 1024, isMobile: width < 768 });
    const page = await context.newPage(); const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await login(page); await expect(page.getByRole("heading", { name: "工作總覽", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /今日收到的購買/ })).toContainText("筆"); await noOverflow(page);
    const create = page.getByRole("main").getByRole("link", { name: /新增團購/ });
    await expect(create).toHaveCount(1);
    const createBox = await create.boundingBox();
    expect(createBox!.width).toBeGreaterThanOrEqual(44);
    expect(createBox!.height).toBeGreaterThanOrEqual(44);
    await create.click({ trial: true });
    await page.mouse.move(0, 0);
    await page.addStyleTag({ content: "nextjs-portal{display:none}" });
    await page.screenshot({ path: info.outputPath(`dashboard-${width}-first.png`), fullPage: false, animations: "disabled" });
    await page.screenshot({ path: info.outputPath(`dashboard-${width}.png`), fullPage: true, animations: "disabled", caret: "initial" });
    const reported = page.getByRole("link", { name: /等待核對付款/ });
    const reportedCount = Number((await reported.innerText()).match(/(\d+) 筆購買/)![1]);
    await reported.click();
    await expect(page).toHaveURL(/\/admin\/qbuy\?view=purchases&status=REPORTED$/);
    const filteredUrl = page.url();
    await expect(page.getByRole("status")).toContainText(`共 ${reportedCount} 筆購買紀錄`);
    await page.getByTestId("purchase-row").first().getByRole("link").first().click();
    await expect(page.getByRole("heading", { name: "購買與訂單詳情" })).toBeVisible();
    await page.getByRole("link", { name: "← 返回查詢結果" }).click();
    await expect(page).toHaveURL(filteredUrl);
    await page.goto("/admin");
    if (width < 1024) {
      const bar = page.getByRole("navigation", { name: "手機快速導覽" });
      await bar.getByRole("link", { name: "更多", exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/more$/);
      await expect(page.getByRole("heading", { name: "更多功能", exact: true })).toBeVisible();
      await expect(bar.getByRole("link", { name: "更多", exact: true })).toHaveAttribute("aria-current", "page");
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await bar.getByRole("link", { name: "訂單", exact: true }).click();
    } else await page.getByRole("navigation", { name: "管理後台導覽" }).getByRole("link", { name: "訂單管理", exact: true }).click();
    await expect(page.getByTestId("purchase-row")).toHaveCount(20); await expect(page.getByRole("status")).toContainText("30 筆購買紀錄"); await noOverflow(page);
    await page.addStyleTag({ content: "nextjs-portal{display:none}" });
    await page.screenshot({ path: info.outputPath(`purchases-${width}.png`), fullPage: false, animations: "disabled", caret: "initial" });
    await page.getByRole("link", { name: "下一頁", exact: true }).click(); await expect(page.getByTestId("purchase-row")).toHaveCount(10);
    if (width < 1024) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.getByTestId("purchase-row").last().getByRole("link").click({ trial: true });
    }
    await showFilters(page);
    const search = page.getByLabel("搜尋編號、顧客、電話、商品或團購"); await search.fill("已入帳"); await page.getByRole("button", { name: "套用查詢" }).click();
    await expect(page.getByRole("status")).toContainText("1 筆購買紀錄");
    await page.getByTestId("purchase-row").getByRole("link").first().click(); await expect(page.getByRole("heading", { name: "購買與訂單詳情" })).toBeVisible();
    await expect(page.getByRole("button", { name: "建立全部正式 QB 訂單" })).toBeVisible(); await noOverflow(page);
    await page.getByRole("link", { name: "← 返回查詢結果" }).click(); await showFilters(page); await expect(search).toHaveValue("已入帳");
    await search.fill("ZZZ沒有這筆訂單"); await page.getByRole("button", { name: "套用查詢" }).click(); await expect(page.getByText("目前沒有符合條件的紀錄")).toBeVisible();
    await showFilters(page);
    await page.getByRole("link", { name: "清除條件", exact: true }).click(); await expect(page).toHaveURL("/admin/qbuy?view=purchases"); await showFilters(page); await expect(search).toHaveValue(""); await expect(page.getByTestId("purchase-row")).toHaveCount(20); await page.getByRole("navigation", { name: "交易類型" }).getByRole("link", { name: "正式訂單", exact: true }).click();
    await expect(page.getByTestId("order-row")).toHaveCount(20); await expect(page.getByTestId("purchase-row")).toHaveCount(0); await noOverflow(page);
    const id = m.scenarios.find(r => r.index === 18)!.checkoutId; await page.goto(`/admin/qbuy/${id}`);
    await expect(page.getByRole("button", { name: "核准取消", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "核實並建立物流", exact: true })).toHaveCount(0);
    await page.locator("details").evaluateAll(nodes => nodes.forEach(n => { (n as HTMLDetailsElement).open = true; })); await noOverflow(page);
    await page.addStyleTag({ content: "nextjs-portal{display:none}" });
    await page.screenshot({ path: info.outputPath(`detail-${width}-first.png`), fullPage: false, animations: "disabled" });
    await page.screenshot({ path: info.outputPath(`detail-${width}.png`), fullPage: true, animations: "disabled", caret: "initial" });
    if (width === 320 || width === 390) {
      await page.goto("/admin/group-buys/new");
      const submit = page.getByRole("button", { name: "建立草稿", exact: true });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await submit.click({ trial: true });
      const submitBox = await submit.boundingBox();
      const barBox = await page.getByRole("navigation", { name: "手機快速導覽" }).boundingBox();
      expect(submitBox!.y + submitBox!.height).toBeLessThanOrEqual(barBox!.y);
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`group-form-${width}-bottom.png`), fullPage: false, animations: "disabled" });
    }
    expect(errors).toEqual([]); await context.close();
  });
}
test("account stays operable across breakpoints and restores focus without trapping desktop", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await login(page);
  const opener = page.getByRole("button", { name: "帳號", exact: true });
  for (let i = 0; i < 3; i++) { await opener.click(); await page.getByRole("button", { name: "關閉帳號選單", exact: true }).click(); await expect(opener).toBeFocused(); }
  await opener.click(); await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("dialog", { name: "管理帳號" })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(opener).toBeFocused();
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
  for(const url of ["/admin/products","/admin/commerce","/admin/group-buys","/admin/suppliers","/admin/operations","/admin/qbuy/notifications"]){const response=await page.goto(url);expect(response?.status()).toBe(200);await noOverflow(page);}
  await page.goto(`/admin/qbuy/invalid-id`); await expect(page.getByText("找不到這筆購買紀錄", { exact: true })).toBeVisible();
  const anonymous = await browser.newPage(); await anonymous.goto(`/admin/qbuy/${m.scenarios[0].checkoutId}`); await expect(anonymous).toHaveURL(/\/admin\/login/); await anonymous.close();
});
