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
  type UpdateGroupBuy = typeof import("@/lib/group-buys/service")["updateGroupBuyDraft"];
  let db: Db;
  let createOrder: CreateOrder;
  let cancelOrder: CancelOrder;
  let cancelOrderAsAdmin: CancelOrderAsAdmin;
  let updateGroupBuy: UpdateGroupBuy;
  let payment: typeof import("@/lib/orders/payment-service")["markOrderPaidAsAdmin"];
  let pickup: typeof import("@/lib/orders/pickup-service")["markOrderPickedUpAsAdmin"];

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

  function groupBuyEditInput(overrides: Record<string, unknown> = {}) {
    const referenceNow = new Date();
    return {
      title: "整合測試團購（已編輯）",
      description: "只影響後續訂單",
      coverImageUrl: "https://example.com/edited.jpg",
      startAt: new Date(referenceNow.getTime() - 60_000),
      endAt: new Date(referenceNow.getTime() + 300_000),
      items: [{ productId: productAId, salePrice: 150, stock: 10, purchaseLimit: null }],
      pickups: [{
        pickupLocationId,
        pickupStartAt: new Date(referenceNow.getTime() + 86_400_000),
        pickupEndAt: new Date(referenceNow.getTime() + 90_000_000),
      }],
      ...overrides,
    };
  }

  beforeAll(async () => {
    const modules = await Promise.all([
      import("@/lib/db"),
      import("@/lib/orders/service"),
      import("@/lib/orders/cancel-service"),
      import("@/lib/group-buys/service"),
    ]);
    db = modules[0].getDb();
    createOrder = modules[1].createOrder;
    cancelOrder = modules[2].cancelOrder;
    cancelOrderAsAdmin = modules[2].cancelOrderAsAdmin;
    updateGroupBuy = modules[3].updateGroupBuyDraft;
    payment = (await import("@/lib/orders/payment-service")).markOrderPaidAsAdmin;
    pickup = (await import("@/lib/orders/pickup-service")).markOrderPickedUpAsAdmin;
  });

  beforeEach(resetDatabase);

  afterAll(async () => {
    await db?.$disconnect();
  });

  test("published edits preserve historical snapshots and affect future Orders", async () => {
    const slug = "gb-0000000000000040";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: null });
    const first = await createOrder(slug, orderInput("0912-440-001", [{ groupBuyItemId: itemAId, quantity: 1 }]));
    const historical = await db.order.findUniqueOrThrow({ where: { publicCode: first.publicCode }, include: { items: true } });
    const nextPickupStart = new Date(Date.now() + 172_800_000);
    const nextPickupEnd = new Date(nextPickupStart.getTime() + 3_600_000);

    await expect(updateGroupBuy(groupBuyId, groupBuyEditInput({
      items: [{ productId: productAId, salePrice: 175, stock: 9, purchaseLimit: 4 }],
      pickups: [{ pickupLocationId, pickupStartAt: nextPickupStart, pickupEndAt: nextPickupEnd }],
    }))).resolves.toEqual({ ok: true, value: { id: groupBuyId } });

    expect(await db.order.findUniqueOrThrow({ where: { publicCode: first.publicCode }, include: { items: true } })).toEqual(historical);
    const second = await createOrder(slug, orderInput("0912-440-002", [{ groupBuyItemId: itemAId, quantity: 2 }]));
    const future = await db.order.findUniqueOrThrow({ where: { publicCode: second.publicCode }, include: { items: true } });
    expect(future).toMatchObject({ pickupStartAt: nextPickupStart, pickupEndAt: nextPickupEnd, totalAmount: 350 });
    expect(future.items).toEqual([expect.objectContaining({ unitPrice: 175, quantity: 2 })]);
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(7);
  });

  test("a stale published edit succeeds during another allocation without overwriting stock", async () => {
    const slug = "gb-0000000000000041";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: null });
    await createOrder(slug, orderInput("0912-441-000", [{ groupBuyItemId: itemAId, quantity: 1 }]));
    const [orderResult, editResult] = await Promise.allSettled([
      createOrder(slug, orderInput("0912-441-001", [{ groupBuyItemId: itemAId, quantity: 1 }])),
      updateGroupBuy(groupBuyId, groupBuyEditInput({
        title: "並行編輯已保存",
        items: [{ productId: productAId, salePrice: 175, stock: 9, purchaseLimit: 4 }],
      })),
    ]);

    expect(orderResult.status).toBe("fulfilled");
    expect(editResult.status).toBe("fulfilled");
    if (editResult.status === "fulfilled") {
      expect(editResult.value).toEqual({ ok: true, value: { id: groupBuyId } });
    }
    expect(await db.order.count()).toBe(2);
    expect(await db.groupBuy.findUniqueOrThrow({ where: { id: groupBuyId }, select: { title: true } })).toEqual({ title: "並行編輯已保存" });
    expect(await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId }, select: { stock: true, salePrice: true, purchaseLimit: true } }))
      .toEqual({ stock: 8, salePrice: 175, purchaseLimit: 4 });
  });

  test.each([
    ["pickup", "pickup"],
    ["admin", "pickup"], ["pickup", "admin"],
    ["customer", "pickup"], ["pickup", "customer"],
  ] as const)("real row-lock race: %s wins ahead of %s", async (first, second) => {
    const slug = "gb-0000000000000020";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: 3, includeB: true, stockB: null });
    const created = await createOrder(slug, orderInput("0912-222-333", [
      { groupBuyItemId: itemAId, quantity: 3 }, { groupBuyItemId: itemBId, quantity: 1 },
    ]));
    // Keep the customer policy open even on slower CI hosts.
    await db.groupBuy.update({ where: { id: groupBuyId }, data: { endAt: new Date(Date.now() + 300_000) } });
    const control = new Client({ connectionString: databaseUrl });
    await control.connect();
    let locked = false;
    const requests: Promise<unknown>[] = [];
    let results: PromiseSettledResult<unknown>[] = [];
    const run = (actor: string) => actor === "pickup" ? pickup(created.publicCode)
      : actor === "admin" ? cancelOrderAsAdmin(created.publicCode)
      : cancelOrder(created.publicCode, created.accessToken);
    async function waitFor(event: string) {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        await control.query("SELECT pg_stat_clear_snapshot()");
        const result = await control.query(`SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock' AND wait_event = $1 AND query LIKE '%UPDATE%Order%'`, [event]);
        if (result.rowCount) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`Expected real PostgreSQL ${event} waiter`);
    }
    try {
      // Test-only audit counts committed Order writes, including accidental duplicate writes.
      await control.query(`CREATE TABLE pickup_write_count (n int);
        CREATE FUNCTION count_pickup_write() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN INSERT INTO pickup_write_count VALUES (1); RETURN NEW; END $$;
        CREATE TRIGGER pickup_write_counter AFTER UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION count_pickup_write();`);
      await control.query("BEGIN");
      locked = true;
      await control.query('SELECT id FROM "Order" WHERE "publicCode" = $1 FOR UPDATE', [created.publicCode]);
      requests.push(run(first));
      // First updater owns the tuple lock while waiting on our transaction.
      await waitFor("transactionid");
      requests.push(run(second));
      // Second updater queues behind that tuple lock, after its authoritative read.
      await waitFor("tuple");
      await control.query("COMMIT");
      locked = false;
      results = await Promise.allSettled(requests);
      expect(results[0].status).toBe("fulfilled");
      if (first === second) {
        expect(results[1]).toEqual(results[0]);
      } else {
        expect(results[1]).toMatchObject({ status: "rejected", reason: { code: first === "pickup" ? "ALREADY_PICKED_UP" : "CANCELLED" } });
      }
      expect((await control.query("SELECT count(*)::int AS count FROM pickup_write_count")).rows[0].count).toBe(1);
      const order = await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode } });
      expect(order.status).toBe(first === "pickup" ? "PLACED" : "CANCELLED");
      if (first === "pickup") {
        expect(order.pickedUpAt).not.toBeNull();
        expect(order.cancelledAt).toBeNull();
        await expect(cancelOrder(created.publicCode, "B".repeat(43))).rejects.toMatchObject({ code: "ACCESS_DENIED" });
        expect((results[0] as PromiseFulfilledResult<{ pickedUpAt: Date }>).value.pickedUpAt).toEqual(order.pickedUpAt);
      } else {
        expect(order.pickedUpAt).toBeNull();
        expect(order.cancelledAt).not.toBeNull();
      }
      expect(await db.groupBuyItem.findMany({ orderBy: { id: "asc" }, select: { stock: true } }))
        .toEqual([{ stock: first === "pickup" ? 7 : 10 }, { stock: null }]);
    } finally {
      if (locked) await control.query("ROLLBACK");
      await Promise.allSettled(requests);
      await control.query('DROP TRIGGER IF EXISTS pickup_write_counter ON "Order"; DROP FUNCTION IF EXISTS count_pickup_write(); DROP TABLE IF EXISTS pickup_write_count;');
      await control.end();
    }
  }, 20_000);

  test("pickup preserves allocation, legacy access and all snapshots after master data changes", async () => {
    const slug = "gb-0000000000000021";
    const phone = "0912-222-334";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: 3, includeB: true, stockB: null });
    const created = await createOrder(slug, orderInput(phone, [
      { groupBuyItemId: itemAId, quantity: 3 }, { groupBuyItemId: itemBId, quantity: 1 },
    ]));
    await db.order.update({ where: { publicCode: created.publicCode }, data: { accessTokenHash: null } });
    const before = await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode }, include: { items: true } });
    await db.product.update({ where: { id: productAId }, data: { name: "edited", unit: "edited", defaultPrice: 1, isActive: false } });
    await db.pickupLocation.update({ where: { id: pickupLocationId }, data: { name: "edited", address: "edited", isActive: false } });
    await db.groupBuyPickup.update({ where: { id: groupBuyPickupId }, data: { pickupStartAt: null, pickupEndAt: null } });
    const result = await pickup(created.publicCode);
    const after = await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode }, include: { items: true } });
    expect(after).toEqual({ ...before, pickedUpAt: result.pickedUpAt, updatedAt: after.updatedAt });
    await expect(pickup(created.publicCode)).resolves.toEqual(result);
    expect((await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode } })).updatedAt).toEqual(after.updatedAt);
    const access = await import("@/lib/orders/admin-service");
    const detail = await access.getAdminOrderByPublicCode(created.publicCode);
    expect(detail).toMatchObject({ ok: true, value: { pickupName: before.pickupName, pickupAddress: before.pickupAddress, pickedUpAt: result.pickedUpAt, items: expect.arrayContaining([expect.objectContaining({ productName: "權威蘋果" }), expect.objectContaining({ productName: "權威橘子" })]) } });
    await db.product.update({ where: { id: productAId }, data: { isActive: true } });
    await db.pickupLocation.update({ where: { id: pickupLocationId }, data: { isActive: true } });
    await expect(createOrder(slug, orderInput(phone, [{ groupBuyItemId: itemAId, quantity: 1 }])))
      .rejects.toMatchObject({ code: "PURCHASE_LIMIT_EXCEEDED" });
    expect(await db.groupBuyItem.findMany({ orderBy: { id: "asc" }, select: { stock: true } })).toEqual([{ stock: 7 }, { stock: null }]);
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

  test.each([
    ["payment", "payment"],
    ["customer", "payment"], ["payment", "customer"],
    ["admin", "payment"], ["payment", "admin"],
    ["pickup", "payment"], ["payment", "pickup"],
  ] as const)("real payment row-lock race: %s commits before %s", async (first, second) => {
    const slug = "gb-0000000000000030";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: 3, includeB: true, stockB: null });
    const created = await createOrder(slug, orderInput("0912-333-444", [
      { groupBuyItemId: itemAId, quantity: 3 }, { groupBuyItemId: itemBId, quantity: 1 },
    ]));
    await db.groupBuy.update({ where: { id: groupBuyId }, data: { endAt: new Date(Date.now() + 300_000) } });
    const before = await db.order.findUniqueOrThrow({
      where: { publicCode: created.publicCode }, include: { items: { orderBy: { id: "asc" } } },
    });
    const control = new Client({ connectionString: databaseUrl });
    await control.connect();
    let locked = false;
    const requests: Promise<unknown>[] = [];
    const run = (actor: string) => actor === "payment" ? payment(created.publicCode)
      : actor === "pickup" ? pickup(created.publicCode)
      : actor === "admin" ? cancelOrderAsAdmin(created.publicCode)
      : cancelOrder(created.publicCode, created.accessToken);
    async function waitFor(event: string) {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        await control.query("SELECT pg_stat_clear_snapshot()");
        const result = await control.query(`SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock' AND wait_event = $1 AND query LIKE '%UPDATE%Order%'`, [event]);
        if (result.rowCount) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`Expected real PostgreSQL ${event} waiter`);
    }
    try {
      await control.query(`CREATE TABLE payment_write_count (paid boolean);
        CREATE FUNCTION count_payment_write() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN INSERT INTO payment_write_count VALUES (OLD."paidAt" IS DISTINCT FROM NEW."paidAt"); RETURN NEW; END $$;
        CREATE TRIGGER payment_write_counter AFTER UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION count_payment_write();`);
      await control.query("BEGIN");
      locked = true;
      await control.query('SELECT id FROM "Order" WHERE "publicCode" = $1 FOR UPDATE', [created.publicCode]);
      requests.push(run(first));
      await waitFor("transactionid");
      requests.push(run(second));
      await waitFor("tuple");
      await control.query("COMMIT");
      locked = false;
      const results = await Promise.allSettled(requests);
      const independent = first === "pickup" || second === "pickup";
      const cancelled = first === "admin" || first === "customer";
      expect(results[0].status).toBe("fulfilled");
      if (independent) {
        expect(results[1].status).toBe("fulfilled");
      } else if (first === second) {
        expect(results[1]).toEqual(results[0]);
      } else {
        expect(results[1]).toMatchObject({
          status: "rejected", reason: { code: cancelled ? "CANCELLED" : "ALREADY_PAID" },
        });
      }
      const order = await db.order.findUniqueOrThrow({
        where: { publicCode: created.publicCode }, include: { items: { orderBy: { id: "asc" } } },
      });
      expect(order.status).toBe(cancelled ? "CANCELLED" : "PLACED");
      if (cancelled) {
        expect(order.cancelledAt).not.toBeNull();
        expect(order.paidAt).toBeNull();
        expect(order.pickedUpAt).toBeNull();
      } else {
        expect(order.cancelledAt).toBeNull();
        expect(order.paidAt).not.toBeNull();
        if (independent) expect(order.pickedUpAt).not.toBeNull();
        else expect(order.pickedUpAt).toBeNull();
        const paymentIndex = first === "payment" ? 0 : 1;
        expect((results[paymentIndex] as PromiseFulfilledResult<{ paidAt: Date }>).value.paidAt).toEqual(order.paidAt);
        if (independent) {
          const pickupIndex = first === "pickup" ? 0 : 1;
          expect((results[pickupIndex] as PromiseFulfilledResult<{ pickedUpAt: Date }>).value.pickedUpAt).toEqual(order.pickedUpAt);
        }
      }
      expect(order).toEqual({
        ...before, status: order.status, paidAt: order.paidAt,
        pickedUpAt: order.pickedUpAt, cancelledAt: order.cancelledAt, updatedAt: order.updatedAt,
      });
      const counts = (await control.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE paid)::int AS paid FROM payment_write_count")).rows[0];
      expect(counts).toEqual({ total: independent ? 2 : 1, paid: cancelled ? 0 : 1 });
      expect(await db.groupBuyItem.findMany({ orderBy: { id: "asc" }, select: { stock: true } }))
        .toEqual([{ stock: cancelled ? 10 : 7 }, { stock: null }]);
      expect(await db.order.count({ where: { status: "CANCELLED", paidAt: { not: null } } })).toBe(0);
      if (!cancelled) {
        await expect(cancelOrder(created.publicCode, "B".repeat(43))).rejects.toMatchObject({ code: "ACCESS_DENIED" });
      }
    } finally {
      if (locked) await control.query("ROLLBACK");
      await Promise.allSettled(requests);
      await control.query('DROP TRIGGER IF EXISTS payment_write_counter ON "Order"; DROP FUNCTION IF EXISTS count_payment_write(); DROP TABLE IF EXISTS payment_write_count;');
      await control.end();
    }
  }, 20_000);

  test.each([false, true])("payment preserves snapshots, allocation and purchaseLimit; legacy=%s", async (legacy) => {
    const slug = "gb-0000000000000031";
    const phone = "0912-333-445";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: 3, includeB: true, stockB: null });
    const created = await createOrder(slug, orderInput(phone, [
      { groupBuyItemId: itemAId, quantity: 3 }, { groupBuyItemId: itemBId, quantity: 1 },
    ]));
    if (legacy) await db.order.update({ where: { publicCode: created.publicCode }, data: { accessTokenHash: null } });
    const before = await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode }, include: { items: true } });
    await db.product.update({ where: { id: productAId }, data: { name: "edited", unit: "edited", defaultPrice: 1, isActive: false } });
    await db.groupBuyItem.update({ where: { id: itemAId }, data: { salePrice: 1 } });
    await db.pickupLocation.update({ where: { id: pickupLocationId }, data: { name: "edited", address: "edited", isActive: false } });
    await db.groupBuyPickup.update({ where: { id: groupBuyPickupId }, data: { pickupStartAt: null, pickupEndAt: null } });
    const result = await payment(created.publicCode);
    const after = await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode }, include: { items: true } });
    expect(after).toEqual({ ...before, paidAt: result.paidAt, updatedAt: after.updatedAt });
    await expect(payment(created.publicCode)).resolves.toEqual(result);
    expect(await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode }, include: { items: true } })).toEqual(after);
    const admin = await import("@/lib/orders/admin-service");
    const customer = await import("@/lib/orders/access-service");
    expect(await admin.getAdminOrderByPublicCode(created.publicCode)).toMatchObject({ ok: true, value: { paidAt: result.paidAt, totalAmount: before.totalAmount } });
    expect(await admin.listAdminOrders()).toMatchObject({ ok: true, value: [{ paidAt: result.paidAt }] });
    if (!legacy) {
      expect(await customer.getOrderForAccess(created.publicCode, created.accessToken)).toMatchObject({ ok: true, value: { paidAt: result.paidAt, totalAmount: before.totalAmount, canCancel: false } });
      await expect(cancelOrder(created.publicCode, created.accessToken)).rejects.toMatchObject({ code: "ALREADY_PAID" });
    }
    await expect(cancelOrderAsAdmin(created.publicCode)).rejects.toMatchObject({ code: "ALREADY_PAID" });
    await expect(cancelOrder(created.publicCode, "B".repeat(43))).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await db.product.update({ where: { id: productAId }, data: { isActive: true } });
    await db.pickupLocation.update({ where: { id: pickupLocationId }, data: { isActive: true } });
    await expect(createOrder(slug, orderInput(phone, [{ groupBuyItemId: itemAId, quantity: 1 }])))
      .rejects.toMatchObject({ code: "PURCHASE_LIMIT_EXCEEDED" });
    await pickup(created.publicCode);
    await expect(payment(created.publicCode)).resolves.toEqual(result);
    await expect(createOrder(slug, orderInput(phone, [{ groupBuyItemId: itemAId, quantity: 1 }])))
      .rejects.toMatchObject({ code: "PURCHASE_LIMIT_EXCEEDED" });
    expect(await db.groupBuyItem.findMany({ orderBy: { id: "asc" }, select: { stock: true } })).toEqual([{ stock: 7 }, { stock: null }]);
  });

  test("7-ELEVEN selection is authoritative, consumed atomically, snapshot-safe, and cancellation restores stock once", async () => {
    const slug = "gb-0000000000000050";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: null });
    await db.groupBuy.update({
      where: { id: groupBuyId },
      data: { allowsSelfPickup: false, allowsSevenEleven: true },
    });
    const selectionService = await import("@/lib/logistics/store-selection");
    const browserABinding = "A".repeat(43);
    const browserBBinding = "B".repeat(43);
    const started = await selectionService.beginSevenElevenStoreSelection(slug, browserABinding);
    const pending = await selectionService.getPendingSevenElevenMapRequest(started.state);
    const concurrentStarted = await selectionService.beginSevenElevenStoreSelection(slug, browserABinding);
    const concurrentPending = await selectionService.getPendingSevenElevenMapRequest(concurrentStarted.state);
    expect(pending).not.toBeNull();
    expect(concurrentPending).not.toBeNull();
    const expectedBindingHash = createHash("sha256").update(browserABinding).digest("base64url");
    expect(await db.sevenElevenStoreSelection.findMany({
      where: { merchantTradeNo: { in: [pending!.merchantTradeNo, concurrentPending!.merchantTradeNo] } },
      orderBy: { merchantTradeNo: "asc" },
      select: { browserBindingHash: true, selectionTokenHash: true },
    })).toEqual([
      { browserBindingHash: expectedBindingHash, selectionTokenHash: null },
      { browserBindingHash: expectedBindingHash, selectionTokenHash: null },
    ]);
    const concurrentCompleted = await selectionService.completeSevenElevenStoreSelection({
      MerchantID: "2000933",
      MerchantTradeNo: concurrentPending!.merchantTradeNo,
      LogisticsSubType: "UNIMARTC2C",
      CVSStoreID: "654321",
      CVSStoreName: "另一偽造門市",
      CVSAddress: "另一偽造地址",
      ExtraData: concurrentStarted.state,
    }, {
      merchantId: "2000933",
      resolveStore: async () => ({ id: "654321", name: "另一權威門市", address: "臺北市權威路 2 號" }),
    });
    expect(concurrentCompleted).not.toBeNull();
    const completed = await selectionService.completeSevenElevenStoreSelection({
      MerchantID: "2000933",
      MerchantTradeNo: pending!.merchantTradeNo,
      LogisticsSubType: "UNIMARTC2C",
      CVSStoreID: "123456",
      CVSStoreName: "瀏覽器偽造",
      CVSAddress: "瀏覽器偽造地址",
      ExtraData: started.state,
    }, {
      merchantId: "2000933",
      resolveStore: async () => ({ id: "123456", name: "權威門市", address: "臺北市權威路 1 號" }),
    });
    expect(completed).not.toBeNull();
    expect(await db.sevenElevenStoreSelection.findUniqueOrThrow({
      where: { merchantTradeNo: pending!.merchantTradeNo },
      select: { browserBindingHash: true },
    })).toEqual({ browserBindingHash: expectedBindingHash });

    await expect(createOrder(slug, {
      customerName: "其他瀏覽器",
      customerPhone: "0944-345-678",
      fulfillmentMethod: "SEVEN_ELEVEN",
      storeSelectionToken: completed!.selectionToken,
      items: [{ groupBuyItemId: itemAId, quantity: 1 }],
    }, { storeSelectionBinding: browserBBinding })).rejects.toMatchObject({ code: "STORE_SELECTION_INVALID" });

    const created = await createOrder(slug, {
      customerName: "超商取貨顧客",
      customerPhone: "0955-345-678",
      fulfillmentMethod: "SEVEN_ELEVEN",
      storeSelectionToken: completed!.selectionToken,
      items: [{ groupBuyItemId: itemAId, quantity: 2 }],
    }, { storeSelectionBinding: browserABinding });
    const order = await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode } });
    expect(order).toMatchObject({
      fulfillmentMethod: "SEVEN_ELEVEN",
      groupBuyPickupId: null,
      pickupName: null,
      sevenElevenStoreId: "123456",
      sevenElevenStoreName: "權威門市",
      sevenElevenStoreAddress: "臺北市權威路 1 號",
    });
    expect(await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId }, select: { stock: true } })).toEqual({ stock: 8 });
    await expect(createOrder(slug, {
      customerName: "重用選擇",
      customerPhone: "0966-345-678",
      fulfillmentMethod: "SEVEN_ELEVEN",
      storeSelectionToken: completed!.selectionToken,
      items: [{ groupBuyItemId: itemAId, quantity: 1 }],
    }, { storeSelectionBinding: browserABinding })).rejects.toMatchObject({ code: "STORE_SELECTION_INVALID" });

    await db.sevenElevenStoreSelection.deleteMany({ where: { orderId: order.id } });
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      sevenElevenStoreId: "123456",
      sevenElevenStoreName: "權威門市",
      sevenElevenStoreAddress: "臺北市權威路 1 號",
    });
    const firstCancellation = await cancelOrderAsAdmin(created.publicCode);
    await expect(cancelOrderAsAdmin(created.publicCode)).resolves.toEqual(firstCancellation);
    expect(await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId }, select: { stock: true } })).toEqual({ stock: 10 });
  });

});
