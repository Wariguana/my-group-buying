import { expect, test } from "@playwright/test";

test("public Group Buy list shows the safe empty state", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "一起買，日常更簡單" })).toBeVisible();
  await expect(page.getByText("目前沒有可查看的團購。")).toBeVisible();
});
