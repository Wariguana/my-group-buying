import { expect, type Page } from "@playwright/test";

export async function inspectUi(page: Page, { expandDetails = true } = {}) {
  // Include controls inside settings, evidence and lifecycle disclosures.
  if (expandDetails) await page.locator("details").evaluateAll(elements => elements.forEach(element => { (element as HTMLDetailsElement).open = true; }));
  await expect.poll(() => page.locator("img").evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete)), { message: "Page images finish loading" }).toBe(true);
  const report = await page.evaluate(() => {
    const faults: string[] = [];
    const counts: Record<string, number> = {};
    for (const element of document.querySelectorAll<HTMLElement>("button,a,input:not([type=hidden]),select,textarea,summary")) {
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      if (!box.width || !box.height || style.display === "none" || style.visibility === "hidden" || element.closest("[hidden]")) continue;
      if (element.classList.contains("qbuy-skip-link") || (element instanceof HTMLInputElement && element.type === "file" && element.classList.contains("sr-only"))) continue;
      const label = (element.getAttribute("aria-label") || element.textContent || element.getAttribute("name") || element.tagName).trim().slice(0, 70);
      const kind = [...element.classList].find(value => /qbuy-(button|link|card-link|row-link|brand-link|admin-nav-link|field|check|disclosure)$/.test(value));
      if (!kind) { faults.push(`${element.tagName} ${label}: missing shared control style`); continue; }
      counts[kind] = (counts[kind] ?? 0) + 1;
      if (element.tagName === "A" && (kind === "qbuy-link" || element.classList.contains("qbuy-button-text"))) faults.push(`${label}: URL action needs a visible button surface`);
      if (kind !== "qbuy-link" && kind !== "qbuy-check" && (box.height < 43.9 || box.width < 43.9)) faults.push(`${label}: touch target ${box.width}×${box.height}`);
      if (kind === "qbuy-button") {
        if (style.fontWeight !== "600") faults.push(`${label}: button weight ${style.fontWeight}`);
        if (style.borderRadius !== "8px") faults.push(`${label}: button radius ${style.borderRadius}`);
        const thumbnail = element.classList.contains("qbuy-button-thumbnail"), icon = element.classList.contains("qbuy-button-icon");
        if (!icon && !thumbnail && style.fontSize !== "14px") faults.push(`${label}: button type ${style.fontSize}`);
        if ((element as HTMLButtonElement).matches(":disabled") && style.opacity !== "0.5") faults.push(`${label}: disabled state ${style.opacity}`);
        if (element.closest("table") && style.whiteSpace !== "nowrap") faults.push(`${label}: table action must remain on one line`);
        const scrollport = element.closest('table')?.parentElement?.getBoundingClientRect();
        if (scrollport && (box.left < scrollport.left - 1 || box.right > scrollport.right + 1)) faults.push(`${label}: table action is clipped by horizontal scrolling`);
      }
      if (kind === "qbuy-field" && style.fontSize !== "16px") faults.push(`${label}: field type ${style.fontSize}`);
      if (kind === "qbuy-check") {
        const labelBox = element.closest("label")?.getBoundingClientRect();
        if (!labelBox || labelBox.height < 43.9) faults.push(`${label}: checkbox/radio label touch target`);
      }
      if (element.tagName === "BUTTON" && !label) faults.push("button without an accessible name");
    }
    if (document.documentElement.scrollWidth > innerWidth) faults.push(`page overflow ${document.documentElement.scrollWidth} > ${innerWidth}`);
    for (const image of document.images) if (image.getBoundingClientRect().width && image.naturalWidth === 0) faults.push(`broken image: ${image.getAttribute("src")}`);
    for (const element of document.querySelectorAll<HTMLElement>('table .font-mono, [data-ui="status-badge"]')) {
      if (element.getBoundingClientRect().width && getComputedStyle(element).whiteSpace !== "nowrap") faults.push(`wrapped identifier/status: ${element.textContent}`);
    }
    return { path: location.pathname + location.search, width: innerWidth, counts, faults };
  });
  expect(report.faults, JSON.stringify(report, null, 2)).toEqual([]);
  return report;
}

export async function inspectButtonStates(page: Page) {
  const primary = page.locator(".qbuy-button-primary:visible:not(:disabled)").first();
  await expect(primary).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(primary).toHaveCSS("background-color", "rgb(146, 64, 14)");
  await primary.hover();
  await expect(primary).toHaveCSS("background-color", "rgb(120, 53, 15)");
  await page.keyboard.press("Tab");
  await primary.focus();
  await expect(primary).toHaveCSS("outline-width", "2px");
  await expect(primary).toHaveCSS("outline-offset", "3px");
  await expect(primary).toHaveCSS("outline-color", "rgb(146, 64, 14)");
}
