// @vitest-environment node

import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { validateE2eTargetDatabaseUrl } from "../../scripts/lib/e2e-database";

vi.mock("server-only", () => ({}));

const shouldRun = process.env.ORDER_INTEGRATION_TEST === "1";
const databaseUrl = process.env.DATABASE_URL;
if (shouldRun) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for order integration tests.");
  validateE2eTargetDatabaseUrl(databaseUrl);
}
const integrationSuite = shouldRun ? describe : describe.skip;

const groupBuyId = "10000000-0000-4000-8000-000000000001";
const pickupLocationId = "20000000-0000-4000-8000-000000000001";
const groupBuyPickupId = "30000000-0000-4000-8000-000000000001";
const productAId = "40000000-0000-4000-8000-000000000001";
const productBId = "40000000-0000-4000-8000-000000000002";
const itemAId = "50000000-0000-4000-8000-00000000000a";
const itemBId = "50000000-0000-4000-8000-00000000000b";

integrationSuite("createOrder PostgreSQL transaction and concurrency", () => {
  type Db = ReturnType<typeof import("@/lib/db")["getDb"]>;
  type CreateOrder = typeof import("@/lib/orders/service")["createOrder"];
  let db: Db;
  let createOrder: CreateOrder;

  async function resetDatabase() {
    await db.orderItem.deleteMany();
    await db.order.deleteMany();
    await db.customer.deleteMany();
    await db.groupBuyItem.deleteMany();
    await db.groupBuyPickup.deleteMany();
    await db.groupBuy.deleteMany();
    await db.product.deleteMany();
    await db.pickupLocation.deleteMany();
  }

  async function seedOrderableGroupBuy(options: {
    slug: string;
    stockA: number | null;
    purchaseLimitA: number | null;
    includeB?: boolean;
    stockB?: number | null;
    purchaseLimitB?: number | null;
  }) {
    const referenceNow = new Date();
    await db.pickupLocation.create({
      data: {
        id: pickupLocationId,
        name: "中正取貨點",
        address: "台北市中正區測試路 1 號",
        isActive: true,
      },
    });
    await db.groupBuy.create({
      data: {
        id: groupBuyId,
        slug: options.slug,
        title: "整合測試團購",
        status: "PUBLISHED",
        startAt: new Date(referenceNow.getTime() - 60_000),
        endAt: new Date(referenceNow.getTime() + 60_000),
        publishedAt: referenceNow,
      },
    });
    await db.groupBuyPickup.create({
      data: {
        id: groupBuyPickupId,
        groupBuyId,
        pickupLocationId,
        pickupStartAt: new Date(referenceNow.getTime() + 86_400_000),
        pickupEndAt: new Date(referenceNow.getTime() + 90_000_000),
      },
    });
    await db.product.createMany({ data: [
      {
        id: productAId,
        name: "權威蘋果",
        defaultPrice: 999,
        cost: 51,
        unit: "箱",
        isActive: true,
      },
      ...(options.includeB ? [{
        id: productBId,
        name: "權威橘子",
        defaultPrice: 888,
        cost: 61,
        unit: "袋",
        isActive: true,
      }] : []),
    ] });
    await db.groupBuyItem.createMany({ data: [
      {
        id: itemAId,
        groupBuyId,
        productId: productAId,
        salePrice: 120,
        cost: 70,
        stock: options.stockA,
        purchaseLimit: options.purchaseLimitA,
        isActive: true,
      },
      ...(options.includeB ? [{
        id: itemBId,
        groupBuyId,
        productId: productBId,
        salePrice: 80,
        cost: 60,
        stock: options.stockB ?? null,
        purchaseLimit: options.purchaseLimitB ?? null,
        isActive: true,
      }] : []),
    ] });
  }

  function orderInput(phone: string, items: { groupBuyItemId: string; quantity: number }[]) {
    return {
      customerName: `訂購人 ${phone}`,
      customerPhone: phone,
      groupBuyPickupId,
      items,
    };
  }

  beforeAll(async () => {
    const modules = await Promise.all([
      import("@/lib/db"),
      import("@/lib/orders/service"),
    ]);
    db = modules[0].getDb();
    createOrder = modules[1].createOrder;
  });

  beforeEach(resetDatabase);

  afterAll(async () => {
    await db?.$disconnect();
  });

  test("persists authoritative snapshots and allocates finite stock on the happy path", async () => {
    const slug = "gb-0000000000000001";
    await seedOrderableGroupBuy({
      slug,
      stockA: 5,
      purchaseLimitA: 4,
      includeB: true,
      stockB: null,
      purchaseLimitB: null,
    });

    expect(itemAId.toUpperCase()).not.toBe(itemAId);
    const result = await createOrder(slug, orderInput("0912-345-678", [
      { groupBuyItemId: itemBId.toUpperCase(), quantity: 2 },
      { groupBuyItemId: itemAId.toUpperCase(), quantity: 1 },
    ]));
    const customer = await db.customer.findUniqueOrThrow({ where: { phone: "+886912345678" } });
    const order = await db.order.findUniqueOrThrow({
      where: { publicCode: result.publicCode },
      include: { items: { orderBy: { groupBuyItemId: "asc" } } },
    });
    const stocks = await db.groupBuyItem.findMany({
      where: { id: { in: [itemAId, itemBId] } },
      orderBy: { id: "asc" },
      select: { id: true, stock: true },
    });

    expect(await db.customer.count({ where: { phone: "+886912345678" } })).toBe(1);
    expect(order).toMatchObject({
      status: "PLACED",
      groupBuyId,
      groupBuyPickupId,
      customerId: customer.id,
      customerName: "訂購人 0912-345-678",
      customerPhone: "+886912345678",
      pickupName: "中正取貨點",
      pickupAddress: "台北市中正區測試路 1 號",
      totalAmount: 280,
    });
    expect(order.items).toEqual([
      expect.objectContaining({
        groupBuyItemId: itemAId,
        productName: "權威蘋果",
        unit: "箱",
        unitPrice: 120,
        quantity: 1,
      }),
      expect.objectContaining({
        groupBuyItemId: itemBId,
        productName: "權威橘子",
        unit: "袋",
        unitPrice: 80,
        quantity: 2,
      }),
    ]);
    expect(order.items.every((line) => !("cost" in line))).toBe(true);
    expect(stocks).toEqual([{ id: itemAId, stock: 4 }, { id: itemBId, stock: null }]);
    expect(result).toEqual({ publicCode: order.publicCode, status: "PLACED", totalAmount: 280 });
    expect(Object.keys(result).sort()).toEqual(["publicCode", "status", "totalAmount"]);
  });

  test("rolls back an earlier item decrement, Order, OrderItems, and new Customer when a later item is out of stock", async () => {
    const slug = "gb-0000000000000002";
    await seedOrderableGroupBuy({
      slug,
      stockA: 1,
      purchaseLimitA: null,
      includeB: true,
      stockB: 0,
      purchaseLimitB: null,
    });
    const phone = "0922-222-222";

    await expect(createOrder(slug, orderInput(phone, [
      { groupBuyItemId: itemBId, quantity: 1 },
      { groupBuyItemId: itemAId, quantity: 1 },
    ]))).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

    expect(await db.order.count()).toBe(0);
    expect(await db.orderItem.count()).toBe(0);
    expect(await db.customer.count({ where: { phone: "+886922222222" } })).toBe(0);
    expect(await db.groupBuyItem.findMany({
      orderBy: { id: "asc" },
      select: { id: true, stock: true },
    })).toEqual([{ id: itemAId, stock: 1 }, { id: itemBId, stock: 0 }]);
  });

  test("allows exactly one of two Customers to buy the final finite-stock item", async () => {
    const slug = "gb-0000000000000003";
    await seedOrderableGroupBuy({ slug, stockA: 1, purchaseLimitA: null });
    const results = await Promise.allSettled([
      createOrder(slug, orderInput("0933-333-331", [{ groupBuyItemId: itemAId, quantity: 1 }])),
      createOrder(slug, orderInput("0933-333-332", [{ groupBuyItemId: itemAId, quantity: 1 }])),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter(({ status }) => status === "rejected") as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(0);
    expect(await db.order.count({ where: { groupBuyId, status: "PLACED" } })).toBe(1);
  });

  test("retries a deterministic purchaseLimit phantom race and caps PLACED consumption", async () => {
    const slug = "gb-0000000000000004";
    await seedOrderableGroupBuy({ slug, stockA: null, purchaseLimitA: 5 });
    const customer = await db.customer.create({ data: { phone: "+886944444444" } });
    const existingOrder = await db.order.create({ data: {
      publicCode: `ord-${randomBytes(12).toString("base64url")}`,
      groupBuyId,
      customerId: customer.id,
      groupBuyPickupId,
      status: "PLACED",
      customerName: "既有訂購人",
      customerPhone: customer.phone,
      pickupName: "中正取貨點",
      pickupAddress: "台北市中正區測試路 1 號",
      totalAmount: 360,
    } });
    await db.orderItem.create({ data: {
      orderId: existingOrder.id,
      groupBuyItemId: itemAId,
      productName: "權威蘋果",
      unit: "箱",
      unitPrice: 120,
      quantity: 3,
    } });

    const control = new Client({ connectionString: databaseUrl });
    await control.connect();
    let lockOpen = false;
    let calls: PromiseSettledResult<Awaited<ReturnType<CreateOrder>>>[] | undefined;
    let requests: ReturnType<CreateOrder>[] = [];
    try {
      await control.query("BEGIN");
      lockOpen = true;
      await control.query('LOCK TABLE "Order" IN SHARE MODE');
      requests = [
        createOrder(slug, orderInput("0944-444-444", [{ groupBuyItemId: itemAId, quantity: 2 }])),
        createOrder(slug, orderInput("0944-444-444", [{ groupBuyItemId: itemAId, quantity: 2 }])),
      ];

      const deadline = Date.now() + 10_000;
      let waiterCount = 0;
      while (Date.now() < deadline) {
        const result = await control.query<{ count: number }>(`
          SELECT COUNT(*)::int AS count
          FROM pg_locks
          WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database())
            AND relation = '"Order"'::regclass
            AND mode = 'RowExclusiveLock'
            AND granted = false
        `);
        waiterCount = result.rows[0]?.count ?? 0;
        if (waiterCount === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(waiterCount).toBe(2);
      await control.query("COMMIT");
      lockOpen = false;
      calls = await Promise.allSettled(requests);
    } finally {
      if (lockOpen) await control.query("ROLLBACK");
      calls ??= await Promise.allSettled(requests);
      await control.end();
    }

    expect(calls.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = calls.filter(({ status }) => status === "rejected") as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "PURCHASE_LIMIT_EXCEEDED" });
    const consumed = await db.orderItem.aggregate({
      where: {
        groupBuyItemId: itemAId,
        order: { customerId: customer.id, groupBuyId, status: "PLACED" },
      },
      _sum: { quantity: true },
    });
    expect(consumed._sum.quantity).toBe(5);
  }, 20_000);
});
