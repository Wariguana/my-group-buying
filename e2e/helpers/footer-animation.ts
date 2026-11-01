import { expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function verifyFooterAnimation(page: Page, directory: string) {
  await mkdir(directory, { recursive: true });
  const records: object[] = [];
  for (const width of [320, 390]) {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const footer = page.locator("footer"), mobile = footer.locator('[data-footer-layout="mobile"]');
    const shopping = mobile.getByRole("button", { name: "購物協助", exact: true });
    const about = mobile.getByRole("button", { name: "關於 QBUY", exact: true });
    await expect(shopping).toHaveAttribute("aria-expanded", "false");
    await page.evaluate(() => document.fonts.ready);
    await footer.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await footer.screenshot({ path: resolve(directory, `closed-${width}.png`) });
    const panelId = (await shopping.getAttribute("aria-controls"))!;
    const panel = page.locator(`[id="${panelId}"]`);
    const initialHeight = (await footer.boundingBox())!.height;
    // Sample actual rendered frames, including interrupted transitions below.
    const sample = () => shopping.evaluate(async button => {
      const panel = document.getElementById(button.getAttribute("aria-controls")!)!;
      const content = panel.firstElementChild!.firstElementChild!;
      const icon = button.querySelector("span")!;
      const started = performance.now(), frames = [];
      do {
        frames.push({ ms: performance.now() - started, height: panel.getBoundingClientRect().height, opacity: Number(getComputedStyle(content).opacity), iconOpacity: Number(getComputedStyle(icon, "::after").opacity), scrollY, sloganY: document.querySelector("footer > p")!.getBoundingClientRect().top, weight: getComputedStyle(button).fontWeight });
        if (frames.length === 1) (button as HTMLButtonElement).click();
        await new Promise(requestAnimationFrame);
      } while (performance.now() - started < 320);
      return frames;
    });
    const opening = await sample(), expandedHeight = opening.at(-1)!.height;
    expect(expandedHeight).toBeGreaterThan(200);
    expect(opening.some(frame => frame.height > 0 && frame.height < expandedHeight - 1 && frame.opacity > 0 && frame.opacity < 1)).toBe(true);
    expect(opening.at(-1)!.opacity).toBe(1);
    expect(opening.at(-1)!.iconOpacity).toBe(0);
    expect(opening.every(frame => frame.weight === "500")).toBe(true);
    expect(Math.max(...opening.map(frame => frame.scrollY)) - Math.min(...opening.map(frame => frame.scrollY))).toBeLessThanOrEqual(1);
    expect(opening.at(-1)!.sloganY - opening[0].sloganY).toBeCloseTo(expandedHeight, 0);
    await expect(shopping).toHaveCSS("color", "rgb(152, 59, 12)");
    await footer.screenshot({ path: resolve(directory, `open-${width}.png`) });
    // Locator screenshots reveal the entire expanded Footer; restore the same
    // document position before comparing the closing frames.
    await page.evaluate(y => scrollTo(0, y), opening[0].scrollY);
    const closing = await sample();
    expect(closing.some(frame => frame.height > 0 && frame.height < expandedHeight - 1 && frame.opacity > 0 && frame.opacity < 1)).toBe(true);
    expect(closing.at(-1)!.height).toBe(0);
    expect(closing.at(-1)!.opacity).toBe(0);
    expect(closing.at(-1)!.iconOpacity).toBe(1);
    expect(Math.max(...closing.map(frame => frame.scrollY)) - Math.min(...closing.map(frame => frame.scrollY))).toBeLessThanOrEqual(1);
    await expect(panel).toHaveAttribute("inert", "");
    await expect(panel.locator("a")).toHaveCount(5);
    await shopping.focus(); await shopping.press("Tab"); await expect(about).toBeFocused();
    expect((await footer.boundingBox())!.height).toBeCloseTo(initialHeight, 0);
    // Real keyboard and touch, independent groups, then rapid reversals during motion.
    await about.press("Enter"); await shopping.press("Space");
    await expect(about).toHaveAttribute("aria-expanded", "true");
    await expect(shopping).toHaveAttribute("aria-expanded", "true");
    await shopping.evaluate(async button => {
      for (let click = 0; click < 7; click++) {
        (button as HTMLButtonElement).click();
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    });
    await expect(shopping).toHaveAttribute("aria-expanded", "false");
    await expect(about).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => panel.evaluate(element => element.getBoundingClientRect().height)).toBe(0);
    const aboutBox = (await about.boundingBox())!;
    await page.touchscreen.tap(aboutBox.x + 12, aboutBox.y + aboutBox.height / 2);
    await expect(about).toHaveAttribute("aria-expanded", "false");
    // Reduced motion must apply final geometry on the next rendered frame.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reduced = await shopping.evaluate(async button => {
      (button as HTMLButtonElement).click(); await new Promise(requestAnimationFrame);
      const panel = document.getElementById(button.getAttribute("aria-controls")!)!;
      return { height: panel.getBoundingClientRect().height, property: getComputedStyle(panel).transitionProperty, duration: getComputedStyle(panel).transitionDuration, opacity: getComputedStyle(panel.firstElementChild!.firstElementChild!).opacity };
    });
    expect(reduced.property).toBe("none"); expect(reduced.opacity).toBe("1"); expect(reduced.height).toBe(expandedHeight);
    await shopping.press("Enter");
    await expect.poll(() => panel.evaluate(element => element.getBoundingClientRect().height)).toBe(0);
    await shopping.focus(); await expect(shopping).toHaveCSS("outline-width", "2px");
    await shopping.press("Tab"); await expect(about).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    records.push({ width, opening, closing, reduced, rapidReversals: "passed", independentGroups: "passed", keyboardAndTouch: "passed", collapsedTabOrder: "trigger to next trigger; no links", closedHeightRestored: true, overflow: false });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await writeFile(resolve(directory, "motion-results.json"), JSON.stringify({ result: "passed", records }, null, 2));
}
