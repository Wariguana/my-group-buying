import { expect, type Page, type TestInfo } from "@playwright/test";
import { inspectUi } from "./ui-consistency";

export async function captureResponsive(page: Page, info: TestInfo, name: string) {
  const original = page.viewportSize();
  try {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await inspectUi(page, { expandDetails: false });
      await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true, animations: "disabled" });
    }
  } finally { if (original) await page.setViewportSize(original); }
}
