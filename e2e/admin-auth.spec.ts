import { expect, test } from "@playwright/test";

test("unauthenticated admin navigation redirects to the login form", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL("/admin/login");
  await expect(page.getByRole("heading", { name: "管理員登入" })).toBeVisible();
  await expect(page.getByRole("form", { name: "管理員登入" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveAttribute("type", "email");
  await expect(page.getByLabel("Email")).toHaveAttribute("autocomplete", "username");
  await expect(page.getByLabel("Password")).toHaveAttribute("type", "password");
  await expect(page.getByLabel("Password")).toHaveAttribute("autocomplete", "current-password");
  await expect(page.getByRole("button", { name: "登入", exact: true })).toBeEnabled();
});

test("login page opens directly without credentials", async ({ page }) => {
  const response = await page.goto("/admin/login");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("form", { name: "管理員登入" })).toBeVisible();
});

for (const route of ["/admin/suppliers", "/admin/suppliers/new"]) {
  test(`unauthenticated supplier route ${route} redirects to login`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL("/admin/login");
    await expect(page.getByRole("heading", { name: "管理員登入" })).toBeVisible();
  });
}

for (const route of ["/admin/products", "/admin/products/new"]) {
  test(`unauthenticated Product route ${route} redirects to login`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL("/admin/login");
    await expect(page.getByRole("heading", { name: "管理員登入" })).toBeVisible();
  });
}

for (const route of ["/admin/pickup-locations", "/admin/pickup-locations/new"]) {
  test(`unauthenticated PickupLocation route ${route} redirects to login`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL("/admin/login");
    await expect(page.getByRole("heading", { name: "管理員登入" })).toBeVisible();
  });
}
