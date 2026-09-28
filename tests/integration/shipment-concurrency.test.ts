// @vitest-environment node

import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { validateE2eTargetDatabaseUrl } from "../../scripts/lib/e2e-database";

vi.mock("server-only", () => ({}));
const shouldRun = process.env.SHIPMENT_INTEGRATION_TEST === "1";
const databaseUrl = process.env.DATABASE_URL;
if (shouldRun) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Shipment integration tests.");
  validateE2eTargetDatabaseUrl(databaseUrl);
}
const suite = shouldRun ? describe : describe.skip;

suite("Shipment PostgreSQL concurrency and integrity", () => {
  type Db = ReturnType<typeof import("@/lib/db")["getDb"]>;
  let db: Db;
  let create: typeof import("@/lib/shipments/service")["createShipmentAsAdmin"];
  let ship: typeof import("@/lib/shipments/service")["markShipmentShippedAsAdmin"];
  let arrive: typeof import("@/lib/shipments/service")["markShipmentArrivedAsAdmin"];
  let returned: typeof import("@/lib/shipments/service")["markShipmentReturnedAsAdmin"];
  let voidShipment: typeof import("@/lib/shipments/service")["voidShipmentAsAdmin"];
  let customerCancel: typeof import("@/lib/orders/cancel-service")["cancelOrder"];
  let adminCancel: typeof import("@/lib/orders/cancel-service")["cancelOrderAsAdmin"];
  let pickup: typeof import("@/lib/orders/pickup-service")["markOrderPickedUpAsAdmin"];
  let payment: typeof import("@/lib/orders/payment-service")["markOrderPaidAsAdmin"];
  let access: typeof import("@/lib/orders/access-service")["getOrderForAccess"];
  let hashToken: typeof import("@/lib/orders/access-token")["hashOrderAccessToken"];
  let sequence = 0;

  beforeAll(async () => {
    db = (await import("@/lib/db")).getDb();
    const shipment = await import("@/lib/shipments/service");
    ({ createShipmentAsAdmin: create, markShipmentShippedAsAdmin: ship,
      markShipmentArrivedAsAdmin: arrive, markShipmentReturnedAsAdmin: returned,
      voidShipmentAsAdmin: voidShipment } = shipment);
    ({ cancelOrder: customerCancel, cancelOrderAsAdmin: adminCancel } = await import("@/lib/orders/cancel-service"));
    pickup = (await import("@/lib/orders/pickup-service")).markOrderPickedUpAsAdmin;
    payment = (await import("@/lib/orders/payment-service")).markOrderPaidAsAdmin;
    access = (await import("@/lib/orders/access-service")).getOrderForAccess;
    hashToken = (await import("@/lib/orders/access-token")).hashOrderAccessToken;
  });
  afterAll(async () => { await db?.$disconnect(); });

  async function seed(options: { endAt?: Date; required?: boolean; method?: "SELF_PICKUP" | "SEVEN_ELEVEN" } = {}) {
    const suffix = randomBytes(12).toString("base64url");
    const groupBuyId = randomUUID();
    const customerId = randomUUID();
    const productId = randomUUID();
    const groupBuyItemId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const publicCode = `ord-${suffix}`;
    const now = new Date();
    sequence += 1;
    await db.groupBuy.create({ data: {
      id: groupBuyId, title: "Shipment test", slug: `shipment-${suffix}`,
      status: "PUBLISHED", startAt: new Date(now.getTime() - 120_000),
      endAt: options.endAt ?? new Date(now.getTime() - 1_000), publishedAt: now,
      allowsSevenEleven: true,
    } });
    let groupBuyPickupId: string | null = null;
    if (options.method === "SELF_PICKUP") {
      const pickupLocationId = randomUUID();
      groupBuyPickupId = randomUUID();
      await db.pickupLocation.create({ data: { id: pickupLocationId, name: "Pickup", address: "Pickup address" } });
      await db.groupBuyPickup.create({ data: { id: groupBuyPickupId, groupBuyId, pickupLocationId } });
    }
    await db.customer.create({ data: { id: customerId, phone: `09${String(sequence).padStart(8, "0")}` } });
    await db.product.create({ data: { id: productId, name: "Shipment item", unit: "item", defaultPrice: 10, cost: 1 } });
    await db.groupBuyItem.create({ data: { id: groupBuyItemId, groupBuyId, productId, salePrice: 10, cost: 1, stock: 4 } });
    const order = await db.order.create({ data: {
      publicCode, orderNumber: `99${String(sequence).padStart(10, "0")}`,
      accessTokenHash: hashToken(token), groupBuyId, customerId,
      status: "PLACED", fulfillmentMethod: options.method ?? "SEVEN_ELEVEN",
      groupBuyPickupId,
      ...(options.required === undefined ? {} : { shipmentRequired: options.required }),
      customerName: "Original recipient", customerPhone: "0912345678",
      ...(options.method === "SELF_PICKUP" ? { pickupName: "Pickup", pickupAddress: "Pickup address" } : {
        sevenElevenStoreId: "123456", sevenElevenStoreName: "Original store",
        sevenElevenStoreAddress: "Original address",
      }),
      totalAmount: 10,
      items: { create: [{ groupBuyItemId, productName: "Shipment item", unit: "item", unitPrice: 10, quantity: 1 }] },
    } });
    return { ...order, token, groupBuyId, groupBuyItemId };
  }

  async function rows(orderId: string) {
    return db.shipment.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
  }
  function tracking() { return `TRACK-${randomUUID()}`; }
  function directData(orderId: string, number = tracking()) {
    return { orderId, provider: "SEVEN_ELEVEN_MYSHIP" as const, trackingNumber: number,
      recipientName: "Recipient", recipientPhone: "0912345678", sevenElevenStoreId: "123456",
      sevenElevenStoreName: "Store", sevenElevenStoreAddress: "Address" };
  }
  async function settled(requests: Promise<unknown>[]) { return Promise.allSettled(requests); }
  function fulfilledCount(results: PromiseSettledResult<unknown>[]) { return results.filter((r) => r.status === "fulfilled").length; }

  function track(request: Promise<unknown>): Promise<PromiseSettledResult<unknown>> {
    return request.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );
  }

  async function waitForOrderWaiters(control: Client, expectedCount: number): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      await control.query("SELECT pg_stat_clear_snapshot()");
      const result = await control.query<{ pid: number; wait_event: string }>(`
        SELECT pid, wait_event FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock'
          AND query LIKE '%"Order"%'
          AND (query LIKE '%FOR UPDATE%' OR query LIKE '%UPDATE%')
          AND wait_event IN ('transactionid', 'tuple')
      `);
      if (result.rows.length === expectedCount &&
          (expectedCount === 1 || new Set(result.rows.map((row) => row.pid)).size === expectedCount)) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out waiting for ${expectedCount} real PostgreSQL Order-row lock contender(s).`);
  }

  /** The first actor reaches the held row before the second is started. */
  async function raceBehindOrderLock(
    publicCode: string,
    first: () => Promise<unknown>,
    second: () => Promise<unknown>,
    afterBothBlocked?: () => Promise<void>,
  ): Promise<[PromiseSettledResult<unknown>, PromiseSettledResult<unknown>]> {
    if (!databaseUrl) throw new Error("Disposable Shipment integration database URL is missing.");
    validateE2eTargetDatabaseUrl(databaseUrl);
    const control = new Client({ connectionString: databaseUrl });
    await control.connect();
    let lockOpen = false;
    const tracked: Promise<PromiseSettledResult<unknown>>[] = [];
    try {
      await control.query("BEGIN");
      lockOpen = true;
      const locked = await control.query('SELECT "id" FROM "Order" WHERE "publicCode" = $1 FOR UPDATE', [publicCode]);
      expect(locked.rowCount).toBe(1);
      tracked.push(track(first()));
      await waitForOrderWaiters(control, 1);
      tracked.push(track(second()));
      await waitForOrderWaiters(control, 2);
      if (afterBothBlocked) await afterBothBlocked();
      await control.query("COMMIT");
      lockOpen = false;
      const outcomes = await Promise.all(tracked);
      return outcomes as [PromiseSettledResult<unknown>, PromiseSettledResult<unknown>];
    } finally {
      if (lockOpen) await control.query("ROLLBACK");
      await Promise.allSettled(tracked);
      await control.end();
    }
  }

  test("normal Order defaults remain off for both fulfillment methods", async () => {
    const seven = await seed();
    const self = await seed({ method: "SELF_PICKUP" });
    expect(seven.shipmentRequired).toBe(false);
    expect(self.shipmentRequired).toBe(false);
    await expect(create(seven.publicCode, tracking())).rejects.toMatchObject({ code: "ORDER_NOT_ELIGIBLE" });
  });

  test("two different creates retain exactly one active row", async () => {
    const order = await seed({ required: true });
    const firstTracking = tracking();
    const secondTracking = tracking();
    const outcomes = await raceBehindOrderLock(order.publicCode,
      () => create(order.publicCode, firstTracking),
      () => create(order.publicCode, secondTracking));
    expect(fulfilledCount(outcomes)).toBe(1);
    expect(outcomes[0]).toMatchObject({ status: "fulfilled", value: { trackingNumber: firstTracking } });
    expect(outcomes[1]).toMatchObject({ status: "rejected", reason: { code: "ACTIVE_SHIPMENT_EXISTS" } });
    expect((await rows(order.id)).map((row) => row.trackingNumber)).toEqual([firstTracking]);
  });
  test("exact duplicate create is idempotent without updatedAt write", async () => {
    const order = await seed({ required: true });
    const number = tracking();
    const outcomes = await raceBehindOrderLock(order.publicCode,
      () => create(order.publicCode, number), () => create(order.publicCode, number));
    expect(fulfilledCount(outcomes)).toBe(2);
    const all = await rows(order.id);
    expect(all).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ status: "fulfilled", value: { id: all[0].id } });
    expect(outcomes[1]).toMatchObject({ status: "fulfilled", value: { id: all[0].id } });
    expect(all[0].updatedAt).toEqual(all[0].createdAt);
  });
  test("tracking uniqueness across Orders is sanitized", async () => {
    const first = await seed({ required: true });
    const second = await seed({ required: true });
    const created = await create(first.publicCode, "Case-TRACK");
    await expect(create(second.publicCode, "Case-TRACK")).rejects.toMatchObject({ code: "TRACKING_NUMBER_IN_USE" });
    expect((await rows(first.id)).map((row) => row.id)).toEqual([created.id]);
    expect(await rows(second.id)).toHaveLength(0);
  });
  test("pre-cutoff customer cancellation versus post-cutoff creation is serialized safely", async () => {
    const order = await seed({ required: true, endAt: new Date(Date.now() + 60_000) });
    const cutoff = new Date(Date.now() + 3_000);
    await db.groupBuy.update({ where: { id: order.groupBuyId }, data: { endAt: cutoff } });
    expect(Date.now()).toBeLessThan(cutoff.getTime());
    const number = tracking();
    const outcomes = await raceBehindOrderLock(order.publicCode,
      () => customerCancel(order.publicCode, { accessToken: order.token }),
      () => create(order.publicCode, number),
      async () => {
        const deadline = Date.now() + 5_000;
        while (Date.now() < cutoff.getTime() && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(Date.now()).toBeGreaterThanOrEqual(cutoff.getTime());
      });
    const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    const active = await db.shipment.count({ where: { orderId: order.id, returnedAt: null, voidedAt: null } });
    expect(outcomes[0]).toMatchObject({ status: "fulfilled", value: { status: "CANCELLED" } });
    expect(outcomes[1]).toMatchObject({ status: "rejected", reason: { code: "ORDER_NOT_ELIGIBLE" } });
    expect(fresh.status).toBe("CANCELLED");
    expect(active).toBe(0);
    expect(await db.groupBuyItem.findUniqueOrThrow({ where: { id: order.groupBuyItemId }, select: { stock: true } })).toEqual({ stock: 5 });
  });
  test("shipment wins when customer cancellation began before cutoff but waited behind it", async () => {
    const order = await seed({ required: true, endAt: new Date(Date.now() + 60_000) });
    const cutoff = new Date(Date.now() + 3_000);
    await db.groupBuy.update({ where: { id: order.groupBuyId }, data: { endAt: cutoff } });
    const number = tracking();
    const outcomes = await raceBehindOrderLock(order.publicCode,
      () => create(order.publicCode, number),
      () => {
        expect(Date.now()).toBeLessThan(cutoff.getTime());
        return customerCancel(order.publicCode, { accessToken: order.token });
      },
      async () => {
        const deadline = Date.now() + 5_000;
        while (Date.now() < cutoff.getTime() && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(Date.now()).toBeGreaterThanOrEqual(cutoff.getTime());
      });
    expect(outcomes[0]).toMatchObject({ status: "fulfilled", value: { trackingNumber: number } });
    expect(outcomes[1].status).toBe("rejected");
    // A Serializable retry takes a fresh now; it may hit the closed cutoff
    // before reaching the otherwise-blocking active Shipment history.
    expect(["SHIPMENT_BLOCKS_CANCELLATION", "CANCELLATION_CLOSED"])
      .toContain((outcomes[1] as PromiseRejectedResult).reason.code);
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true, pickedUpAt: true } }))
      .toEqual({ status: "PLACED", pickedUpAt: null });
    expect((await rows(order.id)).map((row) => row.trackingNumber)).toEqual([number]);
    expect(await db.groupBuyItem.findUniqueOrThrow({ where: { id: order.groupBuyItemId }, select: { stock: true } })).toEqual({ stock: 4 });
  });
  test.each(["create", "admin"] as const)("%s wins create versus Admin cancellation", async (first) => {
    const order = await seed({ required: true });
    const number = tracking();
    const outcomes = await raceBehindOrderLock(order.publicCode,
      first === "create" ? () => create(order.publicCode, number) : () => adminCancel(order.publicCode),
      first === "create" ? () => adminCancel(order.publicCode) : () => create(order.publicCode, number));
    const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(outcomes[0].status).toBe("fulfilled");
    expect(outcomes[1]).toMatchObject({ status: "rejected", reason: { code: first === "create" ? "SHIPMENT_BLOCKS_CANCELLATION" : "ORDER_NOT_ELIGIBLE" } });
    expect(fresh.status).toBe(first === "create" ? "PLACED" : "CANCELLED");
    expect(await db.shipment.count({ where: { orderId: order.id, returnedAt: null, voidedAt: null } })).toBe(first === "create" ? 1 : 0);
    expect(await db.groupBuyItem.findUniqueOrThrow({ where: { id: order.groupBuyItemId }, select: { stock: true } })).toEqual({ stock: fresh.status === "CANCELLED" ? 5 : 4 });
  });
  test.each(["ship", "void"] as const)("%s wins CREATED ship versus void", async (first) => {
    const order = await seed({ required: true });
    const created = await create(order.publicCode, tracking());
    const result = await raceBehindOrderLock(order.publicCode,
      first === "ship" ? () => ship(created.id) : () => voidShipment(created.id),
      first === "ship" ? () => voidShipment(created.id) : () => ship(created.id));
    expect(result[0].status).toBe("fulfilled");
    expect(result[1]).toMatchObject({ status: "rejected", reason: { code: "INVALID_TRANSITION" } });
    const fresh = (await rows(order.id))[0];
    expect(fresh.shippedAt !== null).toBe(first === "ship");
    expect(fresh.voidedAt !== null).toBe(first === "void");
    expect(fresh.arrivedAt).toBeNull();
    expect(fresh.returnedAt).toBeNull();
  });
  test.each(["arrive", "return"] as const)("%s wins SHIPPED arrival versus return", async (first) => {
    const order = await seed({ required: true });
    const created = await ship((await create(order.publicCode, tracking())).id);
    const outcomes = await raceBehindOrderLock(order.publicCode,
      first === "arrive" ? () => arrive(created.id) : () => returned(created.id),
      first === "arrive" ? () => returned(created.id) : () => arrive(created.id));
    expect(outcomes[0].status).toBe("fulfilled");
    if (first === "arrive") expect(outcomes[1].status).toBe("fulfilled");
    else expect(outcomes[1]).toMatchObject({ status: "rejected", reason: { code: "INVALID_TRANSITION" } });
    const fresh = (await rows(order.id))[0];
    expect(fresh.shippedAt).not.toBeNull();
    expect(fresh.arrivedAt !== null).toBe(first === "arrive");
    expect(fresh.returnedAt).not.toBeNull();
    if (first === "arrive") expect(fresh.returnedAt!.getTime()).toBeGreaterThanOrEqual(fresh.arrivedAt!.getTime());
  });
  test.each(["return", "replacement"] as const)("%s wins return versus replacement create", async (first) => {
    const order = await seed({ required: true });
    const created = await ship((await create(order.publicCode, tracking())).id);
    const replacementNumber = tracking();
    const outcomes = await raceBehindOrderLock(order.publicCode,
      first === "return" ? () => returned(created.id) : () => create(order.publicCode, replacementNumber),
      first === "return" ? () => create(order.publicCode, replacementNumber) : () => returned(created.id));
    if (first === "return") {
      expect(outcomes[0].status).toBe("fulfilled");
      // The waiting create may serialize against the pre-return child snapshot.
      // In that case its safe ACTIVE_SHIPMENT_EXISTS result is followed by a
      // fresh successful request after the returned row has committed.
      if (outcomes[1].status === "rejected") {
        expect(outcomes[1]).toMatchObject({ reason: { code: "ACTIVE_SHIPMENT_EXISTS" } });
        expect(await rows(order.id)).toHaveLength(1);
        expect(await create(order.publicCode, replacementNumber)).toMatchObject({ trackingNumber: replacementNumber });
      } else {
        expect(outcomes[1]).toMatchObject({ value: { trackingNumber: replacementNumber } });
      }
    } else {
      expect(outcomes[0]).toMatchObject({ status: "rejected", reason: { code: "ACTIVE_SHIPMENT_EXISTS" } });
      expect(outcomes[1].status).toBe("fulfilled");
    }
    const history = await rows(order.id);
    expect(history[0]).toMatchObject({ id: created.id, trackingNumber: created.trackingNumber });
    expect(history[0].shippedAt).not.toBeNull();
    expect(history[0].returnedAt).not.toBeNull();
    expect(history).toHaveLength(first === "return" ? 2 : 1);
    expect(history.filter((row) => row.returnedAt === null && row.voidedAt === null)).toHaveLength(first === "return" ? 1 : 0);
  });
  test.each(["pickup", "return"] as const)("%s wins ARRIVED pickup versus return", async (first) => {
    const order = await seed({ required: true });
    const created = await arrive((await ship((await create(order.publicCode, tracking())).id)).id);
    const outcomes = await raceBehindOrderLock(order.publicCode,
      first === "pickup" ? () => pickup(order.publicCode) : () => returned(created.id),
      first === "pickup" ? () => returned(created.id) : () => pickup(order.publicCode));
    expect(outcomes[0].status).toBe("fulfilled");
    expect(outcomes[1]).toMatchObject({ status: "rejected", reason: { code: first === "pickup" ? "INVALID_TRANSITION" : "SHIPMENT_NOT_READY" } });
    const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    const shipment = (await rows(order.id))[0];
    expect(fresh.status).toBe("PLACED");
    expect(fresh.pickedUpAt !== null).toBe(first === "pickup");
    expect(shipment.returnedAt !== null).toBe(first === "return");
    expect(shipment.arrivedAt).not.toBeNull();
  });
  test("payment and shipment transition remain independent", async () => {
    const order = await seed({ required: true });
    const created = await create(order.publicCode, tracking());
    const outcome = await raceBehindOrderLock(order.publicCode,
      () => payment(order.publicCode), () => ship(created.id));
    expect(fulfilledCount(outcome)).toBe(2);
    const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(fresh.paidAt).not.toBeNull();
    expect(fresh.pickedUpAt).toBeNull();
    expect(fresh.status).toBe("PLACED");
    const shipment = (await rows(order.id))[0];
    expect(shipment.shippedAt).not.toBeNull();
    expect(shipment.arrivedAt).toBeNull();
    expect(shipment.returnedAt).toBeNull();
  });
  test("direct concurrent active insertion is rejected by partial unique index", async () => {
    const order = await seed({ required: true });
    const results = await settled([db.shipment.create({ data: directData(order.id) }), db.shipment.create({ data: directData(order.id) })]);
    expect(fulfilledCount(results)).toBe(1);
    expect(await db.shipment.count({ where: { orderId: order.id, returnedAt: null, voidedAt: null } })).toBe(1);
  });
  test("direct lifecycle, tracking and snapshot CHECKs reject invalid writes", async () => {
    const order = await seed({ required: true });
    const base = directData(order.id);
    await expect(db.shipment.create({ data: { ...base, arrivedAt: new Date() } })).rejects.toThrow();
    await expect(db.shipment.create({ data: { ...base, returnedAt: new Date() } })).rejects.toThrow();
    for (const trackingNumber of ["", "   ", "\t", "\n", " padded", "padded ", "\tABC", "ABC\n", "\u00a0ABC", "ABC\u00a0", "x".repeat(129)]) {
      await expect(db.shipment.create({ data: { ...base, trackingNumber } })).rejects.toThrow();
    }
    for (const field of ["recipientName", "recipientPhone", "sevenElevenStoreId", "sevenElevenStoreName", "sevenElevenStoreAddress"] as const) {
      for (const blank of ["", "   ", "\t", "\n", "\u00a0"]) {
        await expect(db.shipment.create({ data: { ...base, [field]: blank } })).rejects.toThrow();
      }
    }
    expect(await rows(order.id)).toHaveLength(0);
    const accepted = await db.shipment.create({ data: { ...base, trackingNumber: "a B-/+:_", recipientName: "Two Words", sevenElevenStoreName: "Store With Spaces" } });
    expect(accepted.trackingNumber).toBe("a B-/+:_");
    expect(accepted.recipientName).toBe("Two Words");
  });
  test("Order deletion is restricted while Shipment exists", async () => {
    const order = await seed({ required: true });
    await create(order.publicCode, tracking());
    await expect(db.order.delete({ where: { id: order.id } })).rejects.toThrow();
    expect(await db.order.findUnique({ where: { id: order.id } })).not.toBeNull();
  });
  test("terminal history and replacement keep authoritative snapshots", async () => {
    const order = await seed({ required: true });
    const first = await create(order.publicCode, tracking());
    await voidShipment(first.id);
    await db.order.update({ where: { id: order.id }, data: { customerName: "Later recipient" } });
    const second = await create(order.publicCode, tracking());
    expect((await rows(order.id)).map((row) => row.recipientName)).toEqual(["Original recipient", "Later recipient"]);
    expect(second.voidedAt).toBeNull();
    await expect(create(order.publicCode, first.trackingNumber)).rejects.toMatchObject({ code: "ACTIVE_SHIPMENT_EXISTS" });
  });
  test("endAt extension gates new creation but existing history still blocks cancellation", async () => {
    const order = await seed({ required: true });
    const created = await create(order.publicCode, tracking());
    await db.groupBuy.update({ where: { id: order.groupBuyId }, data: { endAt: new Date(Date.now() + 60_000) } });
    const detail = await access(order.publicCode, { accessToken: order.token });
    expect(detail).toMatchObject({ ok: true, value: { canCancel: false } });
    await expect(customerCancel(order.publicCode, { accessToken: order.token })).rejects.toMatchObject({ code: "SHIPMENT_BLOCKS_CANCELLATION" });
    await voidShipment(created.id);
    await expect(create(order.publicCode, tracking())).rejects.toMatchObject({ code: "ORDER_NOT_ELIGIBLE" });
    expect((await rows(order.id))[0].voidedAt).not.toBeNull();
  });
});
