import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adminNavigation, getAdminDestination, getMobileDestination, mobileNavigation } from "../src/components/admin/navigation";

const manifest = JSON.parse(readFileSync(".temp/adm-preview/manifest.json", "utf8")) as { scenarios: { checkoutId: string }[] };
const viewports = [
  { width: 320, height: 720 }, { width: 375, height: 812 }, { width: 390, height: 844 },
  { width: 768, height: 1024 }, { width: 910, height: 868 }, { width: 1024, height: 768 }, { width: 1440, height: 900 },
];

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function selected(page: Page) {
  const url = new URL(page.url());
  const destination = getAdminDestination(url.pathname, url.searchParams, url.hash);
  const nav = page.getByRole("navigation", { name: page.viewportSize()!.width < 1024 ? "手機快速導覽" : "管理後台導覽" });
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  const id = page.viewportSize()!.width < 1024 ? getMobileDestination(destination) : destination;
  const href = page.viewportSize()!.width < 1024
    ? mobileNavigation.find(link => link.id === id)?.href
    : adminNavigation.flatMap(group => group.links).find(link => link.id === id)?.href;
  await expect(nav.locator('[aria-current="page"]')).toHaveAttribute("href", href!);
}

async function shot(page: Page, info: TestInfo, name: string, fullPage = false) {
  await page.addStyleTag({ content: "nextjs-portal{display:none}" });
  await page.mouse.move(0, 0);
  const file = `${name}-${page.viewportSize()!.width}.png`;
  const path = process.env.ADM_SHELL_EVIDENCE_DIR ? resolve(process.env.ADM_SHELL_EVIDENCE_DIR, file) : info.outputPath(file);
  await page.screenshot({ path, fullPage, animations: "disabled" });
}

for (const viewport of viewports) {
  test(`ADM shell ${viewport.width}×${viewport.height}: navigation, account and real content`, async ({ browser }, info) => {
    test.setTimeout(180000);
    const context = await browser.newContext({ viewport, hasTouch: viewport.width < 1024, isMobile: viewport.width < 768 });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await login(page);
    await expect(page.getByRole("heading", { name: "工作總覽", exact: true })).toBeVisible();
    await selected(page); await noOverflow(page);
    if ([375, 390, 910, 1024, 1440].includes(viewport.width)) await shot(page, info, "overview");

    const account = page.getByRole("button", { name: "帳號", exact: true });
    if (viewport.width < 1024) await account.tap(); else await account.click();
    const dialog = page.getByRole("dialog", { name: "管理帳號" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("adm-preview@example.invalid");
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    const close = dialog.getByRole("button", { name: "關閉帳號選單" });
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab"); await expect(dialog.getByRole("button", { name: "登出", exact: true })).toBeFocused();
    await page.keyboard.press("Tab"); await expect(close).toBeFocused();
    if (viewport.width === 390) await shot(page, info, "account");
    await page.keyboard.press("Escape"); await expect(account).toBeFocused();
    await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    await account.click(); await page.mouse.click(2, 2); await expect(dialog).not.toBeVisible(); await expect(account).toBeFocused();

    if (viewport.width < 1024) {
      await page.getByRole("navigation", { name: "手機快速導覽" }).getByRole("link", { name: "更多", exact: true }).tap();
    } else await page.goto("/admin/more");
    await expect(page.getByRole("heading", { name: "更多功能", exact: true })).toBeVisible();
    await noOverflow(page);
    const more = page.getByRole("navigation", { name: "更多營運功能" });
    const secondaryLinks = adminNavigation.flatMap(group => group.links).filter(link => !link.primary);
    await expect(more.getByRole("link")).toHaveCount(secondaryLinks.length);
    await expect(more.locator('a[href^="/admin/orders"]')).toHaveCount(0);
    await expect(more.locator('a[href^="/admin/pickup-locations"]')).toHaveCount(0);
    for (const href of ["/admin", "/admin/qbuy", "/admin/products"]) await expect(more.locator(`a[href="${href}"]`)).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    if ([320, 390, 768, 910].includes(viewport.width)) {
      await shot(page, info, "more");
      if (viewport.width < 640) {
        await page.locator("#account").scrollIntoViewIfNeeded();
        await shot(page, info, "more-bottom");
      }
    }
    await page.reload(); await expect(page.getByRole("heading", { name: "更多功能", exact: true })).toBeVisible();
    if (viewport.width < 1024) await selected(page);
    for (const link of adminNavigation.flatMap(group => group.links).filter(link => !link.primary)) {
      await page.goto("/admin/more");
      const target = more.locator(`a[href="${link.href}"]`);
      if (viewport.width < 1024) await target.tap(); else await target.click();
      await expect(page).toHaveURL(new RegExp(link.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
      await selected(page); await noOverflow(page);
      if (link.id === "settings") await expect(page.locator("#settings")).toHaveAttribute("open", "");
      if (link.id === "orders") { await expect(page.getByTestId("order-row")).toHaveCount(20); await expect(page.getByTestId("purchase-row")).toHaveCount(0); }
      await page.goBack(); await expect(page).toHaveURL(/\/admin\/more$/);
      await expect(page.getByRole("heading", { name: "更多功能", exact: true })).toBeVisible();
    }

    await page.goto("/admin/qbuy?view=purchases&status=REPORTED");
    await expect(page.getByTestId("purchase-row").first()).toBeVisible(); await selected(page);
    if (viewport.width === 390) await shot(page, info, "purchases");
    const filtered = page.url();
    await page.getByTestId("purchase-row").first().getByRole("link").first().click();
    await expect(page.getByRole("heading", { name: "購買與訂單詳情" })).toBeVisible(); await selected(page);
    await page.goBack(); await expect(page).toHaveURL(filtered); await selected(page);
    await page.goto(`/admin/qbuy/${manifest.scenarios[18].checkoutId}#payment`);
    await expect(page.getByRole("heading", { name: "購買與訂單詳情" })).toBeVisible(); await selected(page); await noOverflow(page);
    if ([320, 390].includes(viewport.width)) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, info, "detail");
      await page.locator("#payment").scrollIntoViewIfNeeded();
      await shot(page, info, "detail-payment");
    }

    if (viewport.width < 1024) {
      await page.goto("/admin/group-buys/new");
      const submit = page.getByRole("button", { name: "建立草稿", exact: true });
      await submit.scrollIntoViewIfNeeded(); await submit.click({ trial: true });
      const submitBox = (await submit.boundingBox())!;
      const barBox = (await page.getByRole("navigation", { name: "手機快速導覽" }).boundingBox())!;
      expect(submitBox.y + submitBox.height).toBeLessThanOrEqual(barBox.y);
      await noOverflow(page);
    }
    expect(errors).toEqual([]);
    await context.close();
  });
}

test("keyboard, reduced motion, long account, enlarged text and logout", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  // A fresh document starts the tab order; the login redirect deliberately focuses page content.
  await page.goto("/admin");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳至主要內容" })).toBeFocused();
  await page.keyboard.press("Enter"); await expect(page.getByRole("main")).toBeFocused();
  await page.goto("/admin/more#account");
  await page.addStyleTag({ content: "html{font-size:200%}" });
  await noOverflow(page);
  await page.getByRole("button", { name: "帳號", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "管理帳號" });
  // Synthetic layout stress only; the actual session and authorization remain unchanged.
  await dialog.locator("p").last().evaluate(node => { node.textContent = "very-long-synthetic-admin-account-address-for-layout@example.invalid"; });
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await dialog.getByRole("button", { name: "關閉帳號選單" }).evaluate(node => getComputedStyle(node).transitionDuration)).toBe("0s");
  await shot(page, info, "enlarged-account");
  let release!: () => void;
  const gate = new Promise<void>(resolveGate => { release = resolveGate; });
  await page.route("**/admin/more*", async route => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });
  const logoutButton = dialog.locator('button[type="submit"]');
  const logout = logoutButton.click();
  try { await expect(logoutButton).toBeDisabled(); await expect(logoutButton).toHaveAttribute("aria-busy", "true"); await expect(logoutButton).toHaveText("登出中…"); }
  finally { release(); await logout; }
  await expect(page).toHaveURL(/\/admin\/login/);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  await page.goto("/admin/more"); await expect(page).toHaveURL(/\/admin\/login/);
});

test("nested maintenance routes, hash history and short desktop sidebar keep the right selection", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await login(page);
  for (const route of ["/admin/products/new", "/admin/group-buys/new", "/admin/suppliers/new"]) {
    await page.goto(route); await selected(page); await noOverflow(page);
  }
  for (const route of ["/admin/products", "/admin/group-buys", "/admin/commerce"]) {
    await page.goto(route);
    if (route === "/admin/commerce") {
      const product = page.getByRole("combobox", { name: "選擇商品" });
      const value = await product.locator("option").nth(1).getAttribute("value");
      await product.selectOption(value!);
      await page.getByRole("button", { name: "管理商品 SKU", exact: true }).click();
    }
    await expect(page.locator('main a[href$="/edit"], main a[href^="/admin/inventory/"]').first()).toBeVisible();
    const hrefs = await page.locator('main a[href]').evaluateAll(nodes => nodes.map(node => node.getAttribute("href")!).filter(href => /\/edit$|^\/admin\/inventory\//.test(href)));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of [...new Set(hrefs)]) { await page.goto(href); await selected(page); await noOverflow(page); }
  }
  await page.goto("/admin/payments"); await selected(page);
  await page.evaluate(() => { window.location.hash = "settings"; }); await selected(page);
  await page.goBack(); await expect(page).toHaveURL(/\/admin\/payments$/); await selected(page);
  await page.getByRole("button", { name: "帳號", exact: true }).click();
  await page.setViewportSize({ width: 910, height: 868 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "帳號", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  await page.setViewportSize({ width: 1024, height: 500 });
  const navigation = page.getByRole("navigation", { name: "管理後台導覽" });
  const last = navigation.getByRole("link", { name: "系統狀態", exact: true });
  await last.focus();
  const box = (await last.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(500);
  await page.keyboard.press("Enter"); await expect(page).toHaveURL(/\/admin\/operations$/);
  await selected(page); await noOverflow(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/admin/more"); await expect(page.getByRole("heading", { name: "更多功能", exact: true })).toBeVisible();
  await noOverflow(page); await selected(page);
  await page.getByRole("button", { name: "帳號", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "管理帳號" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("a slow navigation announces pending while the fixed shell remains usable", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  const gate = new Promise<void>(resolveGate => { release = resolveGate; });
  await page.route("**/admin/qbuy*", async route => {
    if (route.request().headers().rsc === "1") await gate;
    await route.continue();
  });
  await login(page);
  const orders = page.getByRole("navigation", { name: "手機快速導覽" }).getByRole("link", { name: "訂單", exact: true });
  const navigation = orders.click();
  try {
    await expect(orders.getByRole("status")).toHaveText("載入中…");
    await expect(page.getByRole("button", { name: "帳號", exact: true })).toBeVisible();
    await shot(page, info, "navigation-pending");
  } finally { release(); await navigation; }
  await expect(page.getByRole("heading", { name: "訂單管理", exact: true })).toBeVisible();
  await expect(orders.getByRole("status")).toHaveCount(0); await selected(page);
});
