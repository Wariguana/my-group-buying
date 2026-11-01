import { expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { helpArticles, helpGroups } from "../../src/app/help/articles";
import { inspectUi } from "./ui-consistency";
import { verifyFooterAnimation } from "./footer-animation";

export async function verifyHelpCenter(page: Page, directory: string, preview: boolean) {
  await mkdir(directory, { recursive: true });
  const records: object[] = [], footerRecords: object[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
    await footer.scrollIntoViewIfNeeded();
    if (width < 768) {
      const mobile = footer.locator('[data-footer-layout="mobile"]'), buttons = mobile.getByRole("button");
      await expect(buttons).toHaveCount(2);
      expect(await buttons.evaluateAll(elements => elements.every(element => element.getAttribute("aria-expanded") === "false"))).toBe(true);
      await expect(footer.locator("a:visible")).toHaveCount(0);
      const shopping = buttons.first();
      const toggle = shopping.locator('[aria-hidden="true"]');
      expect(await toggle.evaluate(element => getComputedStyle(element, "::after").opacity)).toBe("1");
      await shopping.focus(); await expect(shopping).toHaveCSS("outline-width", "2px");
      await shopping.press("Enter"); await expect(shopping).toHaveAttribute("aria-expanded", "true");
      expect(await toggle.evaluate(element => getComputedStyle(element, "::after").opacity)).toBe("0");
      expect(await toggle.evaluate(element => getComputedStyle(element, "::before").display)).not.toBe("none");
      await shopping.press("Space"); await expect(shopping).toHaveAttribute("aria-expanded", "false");
      expect(await toggle.evaluate(element => getComputedStyle(element, "::after").opacity)).toBe("1");
      const about = buttons.last(), box = await about.boundingBox();
      await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await expect(about).toHaveAttribute("aria-expanded", "true");
      await shopping.press("Enter");
      await expect(shopping).toHaveAttribute("aria-expanded", "true");
      await expect(footer.locator("a:visible")).toHaveCount(9);
      const hrefs = await footer.locator("a:visible").evaluateAll(elements => elements.map(element => element.getAttribute("href")));
      expect(hrefs.sort()).toEqual(helpGroups.flatMap(group => group.slugs).map(slug => `/help/${slug}`).sort());
      const targets = await footer.locator("a:visible, button:visible").evaluateAll(elements => elements.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
      expect(targets.every(target => target.width >= 44 && target.height >= 44)).toBe(true);
      await shopping.evaluate(element => (element as HTMLElement).blur());
      await page.mouse.move(0, 0);
      await footer.screenshot({ path: resolve(directory, `footer-open-${width}.png`) });
      await shopping.press("Space");
      await about.press("Space");
      await about.evaluate(element => (element as HTMLElement).blur());
      await page.mouse.move(0, 0);
      await footer.screenshot({ path: resolve(directory, `footer-${width}.png`) });
    } else {
      await expect(footer.getByRole("button")).toHaveCount(0);
      const groups = footer.locator('[data-footer-layout="desktop"] > section');
      const first = await groups.first().boundingBox(), second = await groups.last().boundingBox();
      expect(second!.x).toBeGreaterThan(first!.x);
      expect(second!.y).toBeCloseTo(first!.y, 0);
      const hrefs = await footer.locator("a:visible").evaluateAll(elements => elements.map(element => element.getAttribute("href")));
      expect(hrefs.sort()).toEqual(helpGroups.flatMap(group => group.slugs).map(slug => `/help/${slug}`).sort());
      await footer.screenshot({ path: resolve(directory, `footer-${width}.png`) });
    }
    await page.mouse.move(0, 0);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const appearance = await footer.evaluate(element => {
      const lastCard = document.querySelector(".qbuy-storefront-grid")?.lastElementChild;
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, topPadding: style.paddingTop, gapAfterLastCard: lastCard ? element.getBoundingClientRect().top + parseFloat(style.paddingTop) - lastCard.getBoundingClientRect().bottom : null };
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const footerScreenshot = `storefront-footer-${width}.png`;
    await page.screenshot({ path: resolve(directory, footerScreenshot) });
    footerRecords.push({ width, ...appearance, overflow: false, screenshot: footerScreenshot });
    if (width < 768) await footer.getByRole("button", { name: "購物協助", exact: true }).press("Enter");
    await footer.getByRole("link", { name: "團購與訂購說明", exact: true }).click();
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText("團購與訂購說明");
    await page.getByRole("link", { name: "返回商城", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("找團購");
    const pages = [{ slug: "", title: "購物協助中心", policy: false }, ...helpArticles];
    for (const article of pages) {
      const path = `/help${article.slug ? `/${article.slug}` : ""}`;
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      const main = page.getByRole("main");
      await expect(main).toHaveCount(1);
      await expect(main.getByRole("heading", { level: 1 })).toHaveText(article.title);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const hrefs = await main.locator("a").evaluateAll(elements => elements.map(element => element.getAttribute("href")));
      for (const href of hrefs) {
        expect(href).toBeTruthy(); expect(href).not.toBe("#");
        if (href!.startsWith("#")) await expect(main.locator(href!)).toHaveCount(1);
        else if (href!.startsWith("/help/")) expect(helpArticles.some(article => `/help/${article.slug}` === href)).toBe(true);
      }
      if (article.slug) {
        if (article.policy) {
          await expect(main.locator("article")).toHaveAttribute("data-policy-status", preview ? "draft-preview" : "unpublished");
          await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
          const sentinel = article.slug === "privacy" ? "登入與識別資料（程式盤點）" : "適用範圍與營運主體（待確認）";
          if (preview) await expect(main.getByRole("heading", { name: sentinel, exact: true })).toBeVisible();
          else expect(await page.content()).not.toContain(sentinel);
        }
        if (article.slug === "faq") {
          const question = main.locator("details").filter({ has: page.getByText("上傳付款截圖就算付款完成嗎？", { exact: true }) });
          await question.locator("summary").focus(); await question.locator("summary").press("Enter");
          await expect(question.locator("p")).toBeVisible();
          await question.locator("summary").press("Space"); await expect(question.locator("p")).not.toBeVisible();
          const box = await question.locator("summary").boundingBox();
          await page.touchscreen.tap(box!.x + 12, box!.y + box!.height / 2);
          await expect(question.locator("p")).toBeVisible();
          await question.locator("summary").press("Space");
        }
        if (width < 1024) {
          const contents = main.locator("details").filter({ has: page.getByText("本頁章節", { exact: true }) });
          await contents.locator("summary").click();
        }
        const contents = main.getByRole("navigation", { name: "本頁章節", exact: true });
        const last = contents.getByRole("link").last();
        const anchor = await last.getAttribute("href");
        await last.click();
        await expect.poll(() => new URL(page.url()).hash).toBe(anchor);
        const target = await main.locator(anchor!).boundingBox(), header = await page.locator(".qbuy-storefront-header").boundingBox();
        expect(target!.y).toBeGreaterThanOrEqual(header!.height - 1);
        await page.evaluate(() => scrollTo(0, 200));
        expect((await page.locator(".qbuy-storefront-header").boundingBox())!.y).toBe(0);
        await page.evaluate(() => scrollTo(0, 0));
      }
      await inspectUi(page, { expandDetails: false });
      const screenshot = [1440, 390].includes(width) ? `${article.slug || "index"}-${width}.png` : null;
      if (screenshot) {
        await page.goto(path);
        await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: resolve(directory, screenshot), fullPage: true });
      }
      records.push({ path, width, policy: article.policy ? preview ? "draft-preview" : "unpublished" : null, overflow: false, realLinks: hrefs.length, anchors: article.slug ? "all exist; last target stays below sticky header" : "not applicable to overview", screenshot });
    }
    await page.goto("/help/not-a-topic");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("找不到這份說明");
    await page.getByRole("link", { name: "返回購物協助中心", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("購物協助中心");
  }
  await verifyFooterAnimation(page, resolve(directory, "animation"));
  expect(errors).toEqual([]);
  await writeFile(resolve(directory, "browser-results.json"), JSON.stringify({ result: "passed", preview, footerRecords, records, errors }, null, 2));
  return { records: records.length, preview, errors };
}
