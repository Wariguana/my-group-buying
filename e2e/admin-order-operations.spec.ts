import { randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../src/generated/prisma/client";
import { validateE2eTargetDatabaseUrl } from "../scripts/lib/e2e-database";

type FixtureOrder = { id: string; publicCode: string; orderNumber: string };
let db: PrismaClient | undefined;
let fixture: {
  groupBuyId: string;
  customerId: string;
  pickupLocationId: string;
  groupBuyPickupId: string;
  productId: string;
  groupBuyItemId: string;
  orders: FixtureOrder[];
} | undefined;

test.beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("E2E database is not configured.");
  // No client or fixture write is possible until the existing disposable guard passes.
  validateE2eTargetDatabaseUrl(databaseUrl);
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }), log: [] });
  const ids = {
    groupBuyId: randomUUID(), customerId: randomUUID(), pickupLocationId: randomUUID(),
    groupBuyPickupId: randomUUID(), productId: randomUUID(), groupBuyItemId: randomUUID(),
  };
  const baseAt = new Date("2099-10-01T01:00:00.000Z");
  const orders = Array.from({ length: 64 }, (_, index) => ({
    id: randomUUID(), publicCode: `ord-${randomBytes(12).toString("base64url")}`,
    orderNumber: `20991002${String(index + 1).padStart(4, "0")}`,
    groupBuyId: ids.groupBuyId, customerId: ids.customerId,
    status: index === 61 ? "CANCELLED" as const : "PLACED" as const,
    fulfillmentMethod: index === 63 ? "SEVEN_ELEVEN" as const : "SELF_PICKUP" as const,
    // A legacy 7-ELEVEN row remains independent of Shipment rules in this phase.
    shipmentRequired: false,
    customerName: "Admin pagination QA", customerPhone: "0912345678", totalAmount: 100,
    createdAt: new Date(baseAt.getTime() + index),
    cancelledAt: index === 61 ? baseAt : null,
    paidAt: index === 62 ? baseAt : null,
    pickedUpAt: index === 0 ? baseAt : null,
    ...(index === 63 ? {
      sevenElevenStoreId: "123456", sevenElevenStoreName: "QA 門市", sevenElevenStoreAddress: "QA 門市地址",
    } : {
      groupBuyPickupId: ids.groupBuyPickupId, pickupName: "QA 自取點", pickupAddress: "QA 自取地址",
    }),
  }));
  await db.$transaction(async (tx) => {
    // Draft fixtures cannot disturb the existing public homepage E2E expectations.
    await tx.groupBuy.create({ data: {
      id: ids.groupBuyId, title: "Admin pagination QA", slug: `gb-${randomBytes(12).toString("base64url")}`,
      status: "DRAFT", startAt: baseAt, endAt: new Date(baseAt.getTime() + 86_400_000), allowsSevenEleven: true,
    } });
    await tx.customer.create({ data: { id: ids.customerId, phone: `qa-${ids.customerId}` } });
    await tx.pickupLocation.create({ data: { id: ids.pickupLocationId, name: "QA 自取點", address: "QA 自取地址" } });
    await tx.groupBuyPickup.create({ data: { id: ids.groupBuyPickupId, groupBuyId: ids.groupBuyId, pickupLocationId: ids.pickupLocationId } });
    await tx.product.create({ data: { id: ids.productId, name: "QA 商品", unit: "份", defaultPrice: 100, cost: 10 } });
    await tx.groupBuyItem.create({ data: { id: ids.groupBuyItemId, groupBuyId: ids.groupBuyId, productId: ids.productId, salePrice: 100, cost: 10 } });
    await tx.order.createMany({ data: orders });
    await tx.orderItem.createMany({ data: orders.map((order) => ({
      orderId: order.id, groupBuyItemId: ids.groupBuyItemId, productName: "QA 商品", unit: "份", unitPrice: 100, quantity: 1,
    })) });
  });
  fixture = { ...ids, orders };
});

test.afterAll(async () => {
  try {
    if (db && fixture) {
      const owned = fixture;
      await db.$transaction(async (tx) => {
        await tx.order.deleteMany({ where: { groupBuyId: owned.groupBuyId } });
        await tx.groupBuyItem.delete({ where: { id: owned.groupBuyItemId } });
        await tx.groupBuyPickup.delete({ where: { id: owned.groupBuyPickupId } });
        await tx.groupBuy.delete({ where: { id: owned.groupBuyId } });
        await tx.product.delete({ where: { id: owned.productId } });
        await tx.pickupLocation.delete({ where: { id: owned.pickupLocationId } });
        await tx.customer.delete({ where: { id: owned.customerId } });
      });
    }
  } finally {
    await db?.$disconnect();
  }
});

async function login(page: Page) {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("E2E credentials are not configured.");
  await page.goto("/admin/orders");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/orders");
  await expect(page.getByRole("region", { name: "訂單列表", exact: true })).toBeVisible();
}

async function visibleOrderCodes(page: Page) {
  return page.getByRole("region", { name: "訂單列表", exact: true })
    .locator('tbody a[href^="/admin/orders/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")!.split("/").at(-1)!));
}

test("Admin exact search, retained filters, queues and bidirectional pagination survive navigation", async ({ page }) => {
  test.setTimeout(90_000);
  if (!fixture) throw new Error("Admin Order QA fixtures are unavailable.");
  await login(page);
  await expect(page.getByText("本頁 50 筆", { exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "取貨方式", exact: true })).toBeVisible();
  const target = fixture.orders[10];
  await page.getByLabel("完整訂單編號", { exact: true }).fill(target.orderNumber);
  await page.getByLabel("訂單狀態", { exact: true }).selectOption("PLACED");
  await page.getByLabel("取貨方式", { exact: true }).selectOption("SELF_PICKUP");
  await page.getByRole("button", { name: "搜尋", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("orderNumber") === target.orderNumber
    && url.searchParams.get("status") === "PLACED" && url.searchParams.get("fulfillment") === "SELF_PICKUP");
  await expect(page.getByText("本頁 1 筆", { exact: true })).toBeVisible();
  const searchedUrl = page.url();
  await page.getByRole("region", { name: "訂單列表", exact: true }).getByRole("row").filter({ hasText: target.orderNumber })
    .getByRole("link", { name: "查看訂單", exact: true }).click();
  await expect(page).toHaveURL(`/admin/orders/${target.publicCode}`);
  await expect(page.getByRole("heading", { name: target.orderNumber, exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(searchedUrl);
  await expect(page.getByLabel("完整訂單編號", { exact: true })).toHaveValue(target.orderNumber);
  await expect(page.getByLabel("訂單狀態", { exact: true })).toHaveValue("PLACED");
  await expect(page.getByLabel("取貨方式", { exact: true })).toHaveValue("SELF_PICKUP");
  await page.reload();
  await expect(page.getByText("本頁 1 筆", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "清除", exact: true }).click();
  await expect(page).toHaveURL("/admin/orders");
  await expect(page.getByText("本頁 50 筆", { exact: true })).toBeVisible();
  await expect(page.getByLabel("完整訂單編號", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("訂單狀態", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("取貨方式", { exact: true })).toHaveValue("");
  await page.getByRole("navigation", { name: "訂單作業佇列", exact: true }).getByRole("link", { name: "待收款", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("queue") === "UNPAID" && !url.searchParams.has("after"));
  await expect(page.getByText("本頁 50 筆", { exact: true })).toBeVisible();
  const firstCodes = await visibleOrderCodes(page);
  expect(firstCodes).toHaveLength(50);
  await page.getByRole("link", { name: "下一批", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("queue") === "UNPAID" && /^ord-/.test(url.searchParams.get("after") ?? ""));
  const olderUrl = page.url();
  await expect(page.getByText("本頁 12 筆", { exact: true })).toBeVisible();
  const olderCodes = await visibleOrderCodes(page);
  expect(olderCodes).toHaveLength(12);
  expect(firstCodes.some((code) => olderCodes.includes(code))).toBe(false);
  expect(new Set([...firstCodes, ...olderCodes]).size).toBe(62);
  expect(olderCodes).toContain(fixture.orders[0].publicCode); // Picked up, still unpaid.
  await page.reload();
  await expect(page).toHaveURL(olderUrl);
  await expect(page.getByText("本頁 12 筆", { exact: true })).toBeVisible();
  expect(await visibleOrderCodes(page)).toEqual(olderCodes);
  await page.getByRole("link", { name: "上一批", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("queue") === "UNPAID" && /^ord-/.test(url.searchParams.get("before") ?? ""));
  await expect(page.getByText("本頁 50 筆", { exact: true })).toBeVisible();
  expect(await visibleOrderCodes(page)).toEqual(firstCodes);

  await page.getByRole("navigation", { name: "訂單作業佇列", exact: true }).getByRole("link", { name: "自取待取貨", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("queue") === "SELF_PICKUP_PENDING" && !url.searchParams.has("before") && !url.searchParams.has("after"));
  await expect(page.getByText("本頁 50 筆", { exact: true })).toBeVisible();
  const selfRows = page.getByRole("region", { name: "訂單列表", exact: true }).locator("tbody tr");
  await expect(selfRows.first()).toContainText("自取");
  await expect(selfRows.first()).toContainText(fixture.orders[62].orderNumber); // Paid orders are still eligible.
  await page.getByRole("link", { name: "下一批", exact: true }).click();
  await expect(page.getByText("本頁 11 筆", { exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "訂單作業佇列", exact: true }).getByRole("link", { name: "全部", exact: true }).click();
  await expect(page).toHaveURL("/admin/orders");
  await expect(page.getByText("本頁 50 筆", { exact: true })).toBeVisible();
  await expect(page.getByLabel("訂單狀態", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("取貨方式", { exact: true })).toHaveValue("");
  await page.getByRole("link", { name: "下一批", exact: true }).click();
  await expect(page).toHaveURL((url) => /^ord-/.test(url.searchParams.get("after") ?? "")
    && !url.searchParams.has("queue") && !url.searchParams.has("before"));
  await expect(page.getByText("本頁 14 筆", { exact: true })).toBeVisible();
  await expect(page.getByLabel("訂單狀態", { exact: true })).toHaveValue("");
  await page.getByLabel("訂單狀態", { exact: true }).selectOption("CANCELLED");
  await page.getByRole("button", { name: "搜尋", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("status") === "CANCELLED" && !url.searchParams.has("after") && !url.searchParams.has("before"));
  await expect(page.getByText("本頁 1 筆", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "訂單列表", exact: true })).toContainText(fixture.orders[61].orderNumber);

  const missingCursor = `ord-${randomBytes(12).toString("base64url")}`;
  await page.goto(`/admin/orders?queue=UNPAID&after=${missingCursor}`);
  await expect(page.getByText("分頁位置無效或已不存在，請回最新一批。", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "訂單列表", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "回最新", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("queue") === "UNPAID" && !url.searchParams.has("after"));
  await expect(page.getByText("本頁 50 筆", { exact: true })).toBeVisible();
  await page.goto("/admin/orders?status=PLACED&status=CANCELLED");
  await expect(page.getByText("查詢條件無效，請清除條件後重新搜尋。", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "訂單列表", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "清除條件", exact: true }).click();
  await expect(page).toHaveURL("/admin/orders");
  await expect(page.getByRole("region", { name: "訂單列表", exact: true })).toBeVisible();
  await expect(page.getByText("本頁 50 筆", { exact: true })).toBeVisible();
  const listHtml = await page.content();
  for (const order of fixture.orders) expect(listHtml).not.toContain(order.id);
  expect(new URL(page.url()).search).not.toContain("0912345678");
});

test("375px Admin controls remain usable and only the table scrolls horizontally", async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 375, height: 900 });
  await login(page);
  await expect(page.getByLabel("完整訂單編號", { exact: true })).toBeVisible();
  await page.getByLabel("取貨方式", { exact: true }).selectOption("SEVEN_ELEVEN");
  await page.getByRole("button", { name: "搜尋", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("fulfillment") === "SEVEN_ELEVEN");
  await expect(page.getByText("本頁 1 筆", { exact: true })).toBeVisible();
  const table = page.getByRole("region", { name: "訂單列表", exact: true });
  const metrics = await table.evaluate((element) => ({
    clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX,
  }));
  expect(metrics.overflowX).toBe("auto");
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  await table.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  expect(await table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  const layout = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const tableRegion = document.querySelector('[role="region"][aria-label="訂單列表"]');
    const overflowingElements = [...document.querySelectorAll("body *")]
      .filter((element) => !tableRegion?.contains(element))
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(), class: element.getAttribute("class"),
          width: Math.round(bounds.width * 10) / 10, right: Math.round(bounds.right * 10) / 10,
        };
      })
      .filter((element) => element.right > viewportWidth)
      .sort((left, right) => right.right - left.right)
      .slice(0, 15);
    return {
      clientWidth: viewportWidth, scrollWidth: document.documentElement.scrollWidth,
      overflowingElements,
    };
  });
  expect(layout.clientWidth).toBe(375);
  expect(layout.scrollWidth, `Overflow outside the scrollable table: ${JSON.stringify(layout.overflowingElements)}`)
    .toBeLessThanOrEqual(layout.clientWidth + 1);
  await page.getByRole("link", { name: "清除", exact: true }).click();
  await expect(page).toHaveURL("/admin/orders");
  await expect(page.getByLabel("取貨方式", { exact: true })).toHaveValue("");
  await expect(page.getByText("本頁 50 筆", { exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "訂單作業佇列", exact: true }).getByRole("link", { name: "待收款", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("queue") === "UNPAID"
    && !url.searchParams.has("fulfillment") && !url.searchParams.has("after"));
  await expect(page.getByText("本頁 50 筆", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "下一批", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("queue") === "UNPAID"
    && /^ord-/.test(url.searchParams.get("after") ?? ""));
  await expect(page.getByText("本頁 12 筆", { exact: true })).toBeVisible();
});
