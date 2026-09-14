// @vitest-environment node

import { createHash, randomBytes } from "node:crypto";
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
  type CancelOrder = typeof import("@/lib/orders/cancel-service")["cancelOrder"];
  type CancelOrderAsAdmin = typeof import("@/lib/orders/cancel-service")["cancelOrderAsAdmin"];
  let db: Db;
  let createOrder: CreateOrder;
  let cancelOrder: CancelOrder;
  let cancelOrderAsAdmin: CancelOrderAsAdmin;

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
      import("@/lib/orders/cancel-service"),
    ]);
    db = modules[0].getDb();
    createOrder = modules[1].createOrder;
    cancelOrder = modules[2].cancelOrder;
    cancelOrderAsAdmin = modules[2].cancelOrderAsAdmin;
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
    expect(order.accessTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.accessToken).not.toBe(order.accessTokenHash);
    expect(order.accessTokenHash).toBe(
      createHash("sha256").update(result.accessToken, "utf8").digest("hex"),
    );
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
    expect(result).toEqual({
      publicCode: order.publicCode,
      status: "PLACED",
      totalAmount: 280,
      accessToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(Object.keys(result).sort()).toEqual(["accessToken", "publicCode", "status", "totalAmount"]);
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

  test.each(["Customer", "Admin"])("%s cancels atomically, restores finite stock, preserves unlimited stock and snapshots", async (actor) => {
    const slug = "gb-0000000000000005";
    await seedOrderableGroupBuy({
      slug,
      stockA: 5,
      purchaseLimitA: 4,
      includeB: true,
      stockB: null,
      purchaseLimitB: null,
    });
    const created = await createOrder(slug, orderInput("0955-555-555", [
      { groupBuyItemId: itemAId, quantity: 2 },
      { groupBuyItemId: itemBId, quantity: 3 },
    ]));
    const before = await db.order.findUniqueOrThrow({
      where: { publicCode: created.publicCode },
      include: { items: { orderBy: { groupBuyItemId: "asc" } } },
    });
    expect(await db.groupBuyItem.findMany({
      orderBy: { id: "asc" },
      select: { id: true, stock: true },
    })).toEqual([{ id: itemAId, stock: 3 }, { id: itemBId, stock: null }]);

    // Master-data edits must not replace the order's historical values.
    await db.product.update({ where: { id: productAId }, data: { name: "新商品名稱", unit: "個", defaultPrice: 1, isActive: false } });
    await db.pickupLocation.update({ where: { id: pickupLocationId }, data: { name: "新取貨點", address: "新地址", isActive: false } });
    const cancelled = actor === "Admin"
      ? await cancelOrderAsAdmin(created.publicCode)
      : await cancelOrder(created.publicCode, created.accessToken);
    const after = await db.order.findUniqueOrThrow({
      where: { publicCode: created.publicCode },
      include: { items: { orderBy: { groupBuyItemId: "asc" } } },
    });

    expect(cancelled).toEqual({
      publicCode: created.publicCode,
      status: "CANCELLED",
      cancelledAt: after.cancelledAt,
    });
    expect(after.status).toBe("CANCELLED");
    expect(after.cancelledAt).not.toBeNull();
    expect(await db.groupBuyItem.findMany({
      orderBy: { id: "asc" },
      select: { id: true, stock: true },
    })).toEqual([{ id: itemAId, stock: 5 }, { id: itemBId, stock: null }]);
    expect({
      customerName: after.customerName,
      customerPhone: after.customerPhone,
      pickupName: after.pickupName,
      pickupAddress: after.pickupAddress,
      pickupStartAt: after.pickupStartAt,
      pickupEndAt: after.pickupEndAt,
      totalAmount: after.totalAmount,
      items: after.items,
    }).toEqual({
      customerName: before.customerName,
      customerPhone: before.customerPhone,
      pickupName: before.pickupName,
      pickupAddress: before.pickupAddress,
      pickupStartAt: before.pickupStartAt,
      pickupEndAt: before.pickupEndAt,
      totalAmount: before.totalAmount,
      items: before.items,
    });
  });

  test.each(["Customer", "Admin"])("%s cancellation releases purchaseLimit for a subsequent createOrder", async (actor) => {
    const slug = "gb-0000000000000006";
    await seedOrderableGroupBuy({ slug, stockA: null, purchaseLimitA: 2 });
    const phone = "0966-666-666";
    const first = await createOrder(slug, orderInput(phone, [
      { groupBuyItemId: itemAId, quantity: 2 },
    ]));
    await expect(createOrder(slug, orderInput(phone, [
      { groupBuyItemId: itemAId, quantity: 1 },
    ]))).rejects.toMatchObject({ code: "PURCHASE_LIMIT_EXCEEDED" });

    if (actor === "Admin") await cancelOrderAsAdmin(first.publicCode);
    else await cancelOrder(first.publicCode, first.accessToken);

    await expect(createOrder(slug, orderInput(phone, [
      { groupBuyItemId: itemAId, quantity: 2 },
    ]))).resolves.toMatchObject({ status: "PLACED" });
    expect(await db.order.count({ where: { status: "CANCELLED" } })).toBe(1);
    expect(await db.order.count({ where: { status: "PLACED" } })).toBe(1);
  });

  test("wrong token cannot mutate Order or restore stock", async () => {
    const slug = "gb-0000000000000007";
    await seedOrderableGroupBuy({ slug, stockA: 5, purchaseLimitA: null });
    const created = await createOrder(slug, orderInput("0977-777-777", [
      { groupBuyItemId: itemAId, quantity: 2 },
    ]));

    await expect(cancelOrder(created.publicCode, "B".repeat(43)))
      .rejects.toMatchObject({ code: "ACCESS_DENIED" });

    expect(await db.order.findUniqueOrThrow({
      where: { publicCode: created.publicCode },
      select: { status: true, cancelledAt: true },
    })).toEqual({ status: "PLACED", cancelledAt: null });
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(3);
  });

  test.each(["Customer", "Admin"])("%s sequential duplicate cancellation preserves timestamp and restores stock once", async (actor) => {
    const slug = "gb-0000000000000008";
    await seedOrderableGroupBuy({ slug, stockA: 8, purchaseLimitA: null });
    const created = await createOrder(slug, orderInput("0988-888-888", [
      { groupBuyItemId: itemAId, quantity: 3 },
    ]));

    const cancel = () => actor === "Admin"
      ? cancelOrderAsAdmin(created.publicCode)
      : cancelOrder(created.publicCode, created.accessToken);
    const first = await cancel();
    const stockAfterFirst = (await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock;
    const second = await cancel();

    expect(second).toEqual(first);
    expect(stockAfterFirst).toBe(8);
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(8);
    expect((await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode } })).cancelledAt)
      .toEqual(first.cancelledAt);
  });

  test.each(["Customer/Customer", "Admin/Admin", "Customer/Admin"])("concurrent %s cancellation restores finite stock exactly once", async (actors) => {
    const slug = "gb-0000000000000009";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: null });
    const created = await createOrder(slug, orderInput("0999-999-999", [
      { groupBuyItemId: itemAId, quantity: 3 },
    ]));
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(7);

    const control = new Client({ connectionString: databaseUrl });
    await control.connect();
    let lockOpen = false;
    let calls: PromiseSettledResult<Awaited<ReturnType<CancelOrder>>>[] | undefined;
    let requests: ReturnType<CancelOrder>[] = [];
    try {
      await control.query("BEGIN");
      lockOpen = true;
      await control.query('LOCK TABLE "Order" IN SHARE MODE');
      requests = [
        actors === "Admin/Admin" ? cancelOrderAsAdmin(created.publicCode) : cancelOrder(created.publicCode, created.accessToken),
        actors === "Customer/Customer" ? cancelOrder(created.publicCode, created.accessToken) : cancelOrderAsAdmin(created.publicCode),
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

    expect(calls).toHaveLength(2);
    expect(calls.every(({ status }) => status === "fulfilled")).toBe(true);
    const results = calls as PromiseFulfilledResult<Awaited<ReturnType<CancelOrder>>>[];
    expect(results[0].value.status).toBe("CANCELLED");
    expect(results[1].value).toEqual(results[0].value);
    const order = await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode } });
    expect(order.status).toBe("CANCELLED");
    expect(order.cancelledAt).not.toBeNull();
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(10);
  }, 20_000);

  test("after cutoff customer is closed, Admin succeeds, and wrong token cannot use cancelled idempotency", async () => {
    const slug = "gb-0000000000000010";
    await seedOrderableGroupBuy({ slug, stockA: 5, purchaseLimitA: null });
    const created = await createOrder(slug, orderInput("0911-222-333", [{ groupBuyItemId: itemAId, quantity: 2 }]));
    await db.groupBuy.update({ where: { id: groupBuyId }, data: { endAt: new Date(Date.now() - 1_000) } });
    await expect(cancelOrder(created.publicCode, created.accessToken)).rejects.toMatchObject({ code: "CANCELLATION_CLOSED" });
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(3);
    const result = await cancelOrderAsAdmin(created.publicCode);
    expect(result.status).toBe("CANCELLED");
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(5);
    await expect(cancelOrder(created.publicCode, created.accessToken)).resolves.toEqual(result);
    await expect(cancelOrder(created.publicCode, "B".repeat(43))).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });

  test("Admin can cancel a legacy null-token order", async () => {
    const slug = "gb-0000000000000011";
    await seedOrderableGroupBuy({ slug, stockA: 5, purchaseLimitA: null });
    const created = await createOrder(slug, orderInput("0911-222-334", [{ groupBuyItemId: itemAId, quantity: 2 }]));
    await db.order.update({ where: { publicCode: created.publicCode }, data: { accessTokenHash: null } });
    await expect(cancelOrderAsAdmin(created.publicCode)).resolves.toMatchObject({ status: "CANCELLED" });
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(5);
  });

  test("Admin restoration failure rolls back the claim and earlier item restoration", async () => {
    const slug = "gb-0000000000000012";
    await seedOrderableGroupBuy({ slug, stockA: 5, purchaseLimitA: null, includeB: true, stockB: 5 });
    const created = await createOrder(slug, orderInput("0911-222-335", [
      { groupBuyItemId: itemAId, quantity: 2 }, { groupBuyItemId: itemBId, quantity: 1 },
    ]));
    // Force a genuine PostgreSQL restoration failure on the second canonical
    // item, only in this disposable DB: incrementing int4 max must overflow.
    await db.groupBuyItem.update({ where: { id: itemBId }, data: { stock: 2_147_483_647 } });
    await expect(cancelOrderAsAdmin(created.publicCode)).rejects.toMatchObject({ code: "FAILED" });
    expect(await db.order.findUniqueOrThrow({
      where: { publicCode: created.publicCode }, select: { status: true, cancelledAt: true },
    })).toEqual({ status: "PLACED", cancelledAt: null });
    expect(await db.groupBuyItem.findMany({ orderBy: { id: "asc" }, select: { id: true, stock: true } }))
      .toEqual([{ id: itemAId, stock: 3 }, { id: itemBId, stock: 2_147_483_647 }]);
  });
});
