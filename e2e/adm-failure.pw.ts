import { test, expect } from "@playwright/test";
import { writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

test("a failed read preserves the shell and retry refetches authoritative order data", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/qbuy");
  await expect(page.getByTestId("purchase-row")).toHaveCount(20);
  const flag = resolve(".temp/adm-preview/shell-read-fault");
  try {
    writeFileSync(flag, "Synthetic read failure; no data or schema mutation.");
    await page.reload();
    await page.addStyleTag({ content: "nextjs-portal{display:none}" });
    await expect(page.getByRole("heading", { name: "訂單資料暫時無法讀取", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "帳號", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "手機快速導覽" })).toBeVisible();
    const path = process.env.ADM_SHELL_EVIDENCE_DIR ? resolve(process.env.ADM_SHELL_EVIDENCE_DIR, "read-error-390.png") : info.outputPath("read-error-390.png");
    await page.screenshot({ path, animations: "disabled" });
    rmSync(flag);
    await page.getByRole("button", { name: "重新載入", exact: true }).click();
    await expect(page.getByTestId("purchase-row")).toHaveCount(20);
    await expect(page.getByRole("heading", { name: "訂單管理", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "手機快速導覽" }).getByRole("link", { name: "訂單", exact: true })).toHaveAttribute("aria-current", "page");
  } finally { rmSync(flag, { force: true }); }
});
