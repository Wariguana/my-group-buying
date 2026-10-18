import { test, expect } from "@playwright/test";
test("health is minimal; operations requires Admin and works on mobile", async ({ page, request }, info) => {
  const live = await request.get("/api/health/live"); expect(live.status()).toBe(200); expect(await live.json()).toEqual({status:"ok"});
  const ready = await request.get("/api/health/ready"); expect(ready.status()).toBe(200); expect(await ready.json()).toEqual({status:"ready"});
  await page.setViewportSize({width:390,height:844});
  await page.goto("/admin/operations"); await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL!); await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button",{name:"登入",exact:true}).click(); await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/operations"); await expect(page.getByRole("heading",{name:"平台與營運監控"})).toBeVisible();
  await expect(page.getByText("需要處理關鍵異常",{exact:false})).toBeVisible();
  await page.screenshot({path:info.outputPath("operations-mobile.png"),fullPage:true});
});
