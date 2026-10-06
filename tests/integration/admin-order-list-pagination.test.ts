// @vitest-environment node

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { validateE2eTargetDatabaseUrl } from "../../scripts/lib/e2e-database";
import type { Prisma } from "@/generated/prisma/client";

vi.mock("server-only", () => ({}));

const shouldRun = process.env.ORDER_INTEGRATION_TEST === "1";
const databaseUrl = process.env.DATABASE_URL;
if (shouldRun) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Admin list integration tests.");
  validateE2eTargetDatabaseUrl(databaseUrl);
}
const suite = shouldRun ? describe : describe.skip;

suite("Admin Order PostgreSQL keyset pagination", () => {
  type Db = ReturnType<typeof import("@/lib/db")["getDb"]>;
  type List = typeof import("@/lib/orders/admin-service")["listAdminOrders"];
  let db: Db;
  let list: List;
  let fixture: { groupBuyId: string; customerId: string; pickupLocationId: string; groupBuyPickupId: string } | undefined;
  let sequence = 0;
  const tiedAt = new Date("2099-10-01T01:00:00.000Z");

  beforeAll(async () => {
    db = (await import("@/lib/db")).getDb();
    list = (await import("@/lib/orders/admin-service")).listAdminOrders;
  });
  afterAll(async () => { await db?.$disconnect(); });

  beforeEach(async () => {
    fixture = undefined;
    sequence = 0;
    const ids = {
      groupBuyId: randomUUID(), customerId: randomUUID(),
      pickupLocationId: randomUUID(), groupBuyPickupId: randomUUID(),
    };
    await db.$transaction(async (tx) => {
      await tx.groupBuy.create({ data: {
        id: ids.groupBuyId, title: "Admin list integration", slug: `gb-${randomBytes(12).toString("base64url")}`,
        status: "DRAFT", startAt: tiedAt, endAt: new Date(tiedAt.getTime() + 86_400_000),
        allowsSevenEleven: true,
      } });
      await tx.customer.create({ data: { id: ids.customerId, phone: `fixture-${ids.customerId}` } });
      await tx.pickupLocation.create({ data: { id: ids.pickupLocationId, name: "Integration pickup", address: "Fixture address" } });
      await tx.groupBuyPickup.create({ data: {
        id: ids.groupBuyPickupId, groupBuyId: ids.groupBuyId, pickupLocationId: ids.pickupLocationId,
      } });
    });
    fixture = ids;
  });
  afterEach(async () => {
    vi.useRealTimers();
    if (!fixture) return;
    const owned = fixture;
    fixture = undefined;
    // Only this test's fixtures are removed; the guarded runner owns the database.
    await db.$transaction(async (tx) => {
      await tx.shipment.deleteMany({ where: { order: { groupBuyId: owned.groupBuyId } } });
      await tx.order.deleteMany({ where: { groupBuyId: owned.groupBuyId } });
      await tx.groupBuyPickup.delete({ where: { id: owned.groupBuyPickupId } });
      await tx.groupBuy.delete({ where: { id: owned.groupBuyId } });
      await tx.pickupLocation.delete({ where: { id: owned.pickupLocationId } });
      await tx.customer.delete({ where: { id: owned.customerId } });
    });
  });

  function orderData(patch: {
    status?: "PLACED" | "CANCELLED";
    fulfillmentMethod?: "SELF_PICKUP" | "SEVEN_ELEVEN";
    paidAt?: Date | null;
    pickedUpAt?: Date | null;
    createdAt?: Date;
    shipmentRequired?: boolean;
  } = {}) {
    if (!fixture) throw new Error("Admin list fixture is not initialized.");
    sequence += 1;
    const fulfillmentMethod = patch.fulfillmentMethod ?? "SELF_PICKUP";
    const status = patch.status ?? "PLACED";
    return {
      id: randomUUID(), publicCode: `ord-${randomBytes(12).toString("base64url")}`,
      orderNumber: `20991001${String(sequence).padStart(4, "0")}`,
      groupBuyId: fixture.groupBuyId, customerId: fixture.customerId,
      status, fulfillmentMethod, shipmentRequired: patch.shipmentRequired ?? false,
      customerName: "Admin list fixture", customerPhone: "0912345678", totalAmount: 100,
      createdAt: patch.createdAt ?? tiedAt, paidAt: patch.paidAt ?? null,
      pickedUpAt: patch.pickedUpAt ?? null, cancelledAt: status === "CANCELLED" ? tiedAt : null,
      ...(fulfillmentMethod === "SELF_PICKUP" ? {
        groupBuyPickupId: fixture.groupBuyPickupId, pickupName: "Integration pickup", pickupAddress: "Fixture address",
      } : {
        sevenElevenStoreId: "123456", sevenElevenStoreName: "Fixture store", sevenElevenStoreAddress: "Fixture address",
      }),
    };
  }

  async function page(input: unknown = {}) {
    const result = await list(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Admin list failed: ${result.error}`);
    expect(result.value.pageSize).toBe(50);
    expect(result.value.returnedCount).toBe(result.value.items.length);
    expect(result.value.items.length).toBeLessThanOrEqual(50);
    return result.value;
  }

  type ShippingState = "CREATED" | "SHIPPED" | "ARRIVED" | "RETURNED" | "VOIDED";
  function shipmentData(orderId: string, state: ShippingState, createdAt = tiedAt): Prisma.ShipmentCreateManyInput {
    return {
      id: randomUUID(), orderId, provider: "SEVEN_ELEVEN_MYSHIP", trackingNumber: `fixture-${randomUUID()}`,
      recipientName: "Private recipient", recipientPhone: "0912345678", sevenElevenStoreId: "123456",
      sevenElevenStoreName: "Private store", sevenElevenStoreAddress: "Private address", createdAt,
      shippedAt: ["SHIPPED", "ARRIVED", "RETURNED"].includes(state) ? createdAt : null,
      arrivedAt: state === "ARRIVED" ? createdAt : null,
      returnedAt: state === "RETURNED" ? createdAt : null, voidedAt: state === "VOIDED" ? createdAt : null,
    };
  }

  test("all five shipment queues filter mixed histories before slicing and traverse tied timestamps exactly once both ways", async () => {
    await db.groupBuy.update({ where: { id: fixture!.groupBuyId }, data: {
      startAt: new Date("2019-12-01T00:00:00Z"), endAt: new Date("2020-01-01T00:00:00Z"),
    } });
    const kinds = ["NONE", "VOIDED", "CREATED", "SHIPPED", "ARRIVED", "RETURNED",
      "RETURNED_CREATED", "RETURNED_SHIPPED", "RETURNED_ARRIVED", "RETURNED_VOIDED", "VOIDED_CREATED",
      "LEGACY", "SELF", "CANCELLED", "PICKED_UP"] as const;
    const fixtures = Array.from({ length: 32 }, (_, repetition) => kinds.map((kind) => ({
      kind,
      order: orderData({ fulfillmentMethod: kind === "SELF" ? "SELF_PICKUP" : "SEVEN_ELEVEN",
        shipmentRequired: !["LEGACY", "SELF"].includes(kind),
        status: kind === "CANCELLED" ? "CANCELLED" : "PLACED",
        paidAt: repetition % 2 && kind !== "CANCELLED" ? tiedAt : null,
        pickedUpAt: kind === "PICKED_UP" ? tiedAt : null }),
    }))).flat();
    const shipmentRows = fixtures.flatMap(({ kind, order }) => {
      if (["NONE", "LEGACY", "SELF", "CANCELLED"].includes(kind)) return [];
      const states = kind === "PICKED_UP" ? ["ARRIVED"] : kind.split("_");
      return states.map((state, index) => shipmentData(order.id, state as ShippingState, new Date(tiedAt.getTime() + index)));
    });
    await db.order.createMany({ data: fixtures.map(({ order }) => order) });
    await db.shipment.createMany({ data: shipmentRows });
    const memberships = [
      ["SHIPMENT_TO_CREATE", ["NONE", "VOIDED"]],
      ["SHIPMENT_CREATED", ["CREATED", "RETURNED_CREATED", "VOIDED_CREATED"]],
      ["SHIPMENT_SHIPPED", ["SHIPPED", "RETURNED_SHIPPED"]],
      ["SHIPMENT_ARRIVED", ["ARRIVED", "RETURNED_ARRIVED"]],
      ["SHIPMENT_RETURNED", ["RETURNED", "RETURNED_VOIDED"]],
    ] as const;
    for (const [queue, kinds] of memberships) {
      const expected = fixtures.filter(({ kind }) => (kinds as readonly string[]).includes(kind))
        .map(({ order }) => order).sort((a, b) => a.id < b.id ? 1 : -1).map((row) => row.publicCode);
      expect(expected.length).toBeGreaterThan(50);
      const input = { queue, status: "PLACED", fulfillment: "SEVEN_ELEVEN" };
      const first = await page(input);
      expect(first.returnedCount).toBe(50);
      const forward = await allOlder(input);
      expect(forward.codes).toEqual(expected);
      expect(new Set(forward.codes).size).toBe(expected.length);
      let current = forward.last;
      const batches = [current.items.map((row) => row.publicCode)];
      while (current.hasNewer) {
        current = await page({ ...input, navigation: { direction: "NEWER", anchorPublicCode: current.newerCursor } });
        batches.unshift(current.items.map((row) => row.publicCode));
        expect(batches.length).toBeLessThan(10);
      }
      expect(batches.flat()).toEqual(expected);
      expect(new Set(batches.flat()).size).toBe(expected.length);
    }
    // Verify the outward summary against all mixed fixtures, including excluded orders.
    const all = await allOlder();
    const ownedCodes = new Set(fixtures.map(({ order }) => order.publicCode));
    expect(all.codes.filter((code) => ownedCodes.has(code))).toHaveLength(fixtures.length);
    for (const kind of kinds) {
      const { order } = fixtures.find((row) => row.kind === kind)!;
      const item = (await page({ orderNumber: order.orderNumber })).items[0];
      const expected = ["NONE", "LEGACY", "SELF", "CANCELLED"].includes(kind) ? null
        : kind === "PICKED_UP" ? "PICKED_UP" : kind.split("_").at(-1);
      expect(item.shipmentState).toBe(expected);
      expect(item.hasReturnedShipmentHistory).toBe(kind.startsWith("RETURNED"));
      expect(item.shipmentRequired).toBe(order.shipmentRequired);
      expect(JSON.stringify(item)).not.toMatch(/"id"|"orderId"|trackingNumber|recipient|sevenElevenStore|shippedAt|arrivedAt|returnedAt|voidedAt|activeShipmentId|"shipments"/);
    }
  });

  test.each([
    ["SHIPMENT_CREATED", "CREATED", "SHIPPED"], ["SHIPMENT_ARRIVED", "ARRIVED", "RETURNED"],
  ] as const)("%s anchor remains valid after its shipment moves from %s to %s", async (queue, state, next) => {
    const orders = Array.from({ length: 75 }, () => orderData({ fulfillmentMethod: "SEVEN_ELEVEN", shipmentRequired: true }));
    await db.order.createMany({ data: orders });
    await db.shipment.createMany({ data: orders.map((order) => shipmentData(order.id, state)) });
    const original = orders.sort((a, b) => a.id < b.id ? 1 : -1).map((row) => row.publicCode);
    const first = await page({ queue });
    const anchor = orders.find((row) => row.publicCode === first.olderCursor)!;
    await db.shipment.updateMany({ where: { orderId: anchor.id }, data: next === "SHIPPED" ? { shippedAt: tiedAt } : { returnedAt: tiedAt } });
    const older = await page({ queue, navigation: { direction: "OLDER", anchorPublicCode: anchor.publicCode } });
    expect(older.items.map((row) => row.publicCode)).toEqual(original.slice(50));
    expect(older.hasNewer).toBe(true);
    const newer = await page({ queue, navigation: { direction: "NEWER", anchorPublicCode: older.newerCursor } });
    expect(newer.items.map((row) => row.publicCode)).toEqual(original.slice(0, 49));
    await expect(list({ queue, navigation: { direction: "OLDER", anchorPublicCode: `ord-${randomBytes(12).toString("base64url")}` } }))
      .resolves.toEqual({ ok: false, error: "INVALID_CURSOR" });
  });

  test("TO_CREATE honors before/exact/after current cutoff and extensions, while active and returned queues ignore cutoff/payment", async () => {
    const cutoff = new Date(tiedAt.getTime() + 86_400_000);
    const kinds = ["NONE", "VOIDED", "CREATED", "SHIPPED", "ARRIVED", "RETURNED"] as const;
    const orders = kinds.flatMap((kind) => [null, tiedAt].map((paidAt) => ({ kind,
      order: orderData({ fulfillmentMethod: "SEVEN_ELEVEN", shipmentRequired: true, paidAt }) })));
    await db.order.createMany({ data: orders.map(({ order }) => order) });
    await db.shipment.createMany({ data: orders.flatMap(({ kind, order }) => kind === "NONE" ? [] : [shipmentData(order.id, kind)]) });
    vi.useFakeTimers({ toFake: ["Date"] });
    for (const offset of [-1, 0, 1]) {
      vi.setSystemTime(new Date(cutoff.getTime() + offset));
      expect((await page({ queue: "SHIPMENT_TO_CREATE" })).returnedCount).toBe(offset < 0 ? 0 : 4);
      for (const state of ["CREATED", "SHIPPED", "ARRIVED", "RETURNED"]) {
        expect((await page({ queue: `SHIPMENT_${state}` })).returnedCount).toBe(2);
      }
    }
    await db.groupBuy.update({ where: { id: fixture!.groupBuyId }, data: { endAt: new Date(cutoff.getTime() + 10_000) } });
    expect((await page({ queue: "SHIPMENT_TO_CREATE" })).returnedCount).toBe(0);
    for (const state of ["CREATED", "SHIPPED", "ARRIVED", "RETURNED"]) {
      expect((await page({ queue: `SHIPMENT_${state}` })).returnedCount).toBe(2);
    }
  });

  async function expectedCodes(where: Prisma.OrderWhereInput = {}) {
    const rows = await db.order.findMany({ where, select: { id: true, publicCode: true, createdAt: true } });
    rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()
      || (left.id < right.id ? 1 : left.id > right.id ? -1 : 0));
    return rows.map((row) => row.publicCode);
  }

  async function allOlder(input: Record<string, unknown> = {}) {
    const codes: string[] = [];
    let current = await page(input);
    for (let batch = 0; batch < 10; batch += 1) {
      codes.push(...current.items.map((row) => row.publicCode));
      if (!current.hasOlder) return { codes, last: current };
      expect(current.olderCursor).not.toBeNull();
      current = await page({ ...input, navigation: { direction: "OLDER", anchorPublicCode: current.olderCursor } });
    }
    throw new Error("Admin list pagination did not reach its bounded end.");
  }

  test("more than 50 identical timestamps traverse exactly once in both directions", async () => {
    await db.order.createMany({ data: Array.from({ length: 123 }, () => orderData()) });
    const expected = await expectedCodes();
    const first = await page();
    expect(first.items.map((row) => row.publicCode)).toEqual(expected.slice(0, 50));
    expect(first.hasNewer).toBe(false);
    expect(first.newerCursor).toBeNull();
    const forward = await allOlder();
    expect(forward.codes).toEqual(expected);
    expect(new Set(forward.codes).size).toBe(expected.length);
    expect(forward.last.hasOlder).toBe(false);
    expect(forward.last.olderCursor).toBeNull();

    let current = forward.last;
    const reverseBatches = [current.items.map((row) => row.publicCode)];
    for (let batch = 0; current.hasNewer && batch < 10; batch += 1) {
      expect(current.newerCursor).not.toBeNull();
      current = await page({ navigation: { direction: "NEWER", anchorPublicCode: current.newerCursor } });
      reverseBatches.unshift(current.items.map((row) => row.publicCode));
    }
    expect(current.hasNewer).toBe(false);
    const backward = reverseBatches.flat();
    expect(backward).toEqual(expected);
    expect(new Set(backward).size).toBe(expected.length);
  });

  test("newest insertion leaves an existing older boundary unchanged", async () => {
    await db.order.createMany({ data: Array.from({ length: 70 }, () => orderData()) });
    const original = await expectedCodes();
    const first = await page();
    const inserted = await db.order.create({ data: orderData({ createdAt: new Date(tiedAt.getTime() + 1_000) }) });
    const older = await page({ navigation: { direction: "OLDER", anchorPublicCode: first.olderCursor } });
    expect(older.items.map((row) => row.publicCode)).toEqual(original.slice(50, 100));
    expect(older.items.some((row) => row.publicCode === inserted.publicCode)).toBe(false);
    expect(first.items.some((row) => older.items.some((next) => next.publicCode === row.publicCode))).toBe(false);
    expect((await page()).items[0].publicCode).toBe(inserted.publicCode);
    // This verifies stable keyset position, not a cross-request fixed snapshot.
  });

  test("mixed status, fulfillment, payment and pickup filter in PostgreSQL before page slicing", async () => {
    const mixed = Array.from({ length: 180 }, (_, index) => {
      switch (index % 5) {
        case 0: return orderData();
        case 1: return orderData({ pickedUpAt: tiedAt });
        case 2: return orderData({ fulfillmentMethod: "SEVEN_ELEVEN" });
        case 3: return orderData({ paidAt: tiedAt });
        default: return orderData({ status: "CANCELLED", fulfillmentMethod: "SEVEN_ELEVEN" });
      }
    });
    await db.order.createMany({ data: mixed });
    const cases = [
      { input: { queue: "UNPAID" }, where: { status: "PLACED" as const, cancelledAt: null, paidAt: null } },
      { input: { queue: "SELF_PICKUP_PENDING" }, where: { status: "PLACED" as const, cancelledAt: null, fulfillmentMethod: "SELF_PICKUP" as const, pickedUpAt: null } },
      { input: { queue: "UNPAID", status: "PLACED", fulfillment: "SELF_PICKUP" }, where: { status: "PLACED" as const, cancelledAt: null, fulfillmentMethod: "SELF_PICKUP" as const, paidAt: null } },
      { input: { status: "CANCELLED", fulfillment: "SEVEN_ELEVEN" }, where: { status: "CANCELLED" as const, fulfillmentMethod: "SEVEN_ELEVEN" as const } },
    ];
    for (const { input, where } of cases) {
      const expected = await expectedCodes(where);
      const first = await page(input);
      expect(first.items.map((row) => row.publicCode)).toEqual(expected.slice(0, 50));
      expect(first.returnedCount).toBe(Math.min(expected.length, 50));
      expect((await allOlder(input)).codes).toEqual(expected);
    }
    const unpaid = (await allOlder({ queue: "UNPAID" })).codes;
    for (const pickedUnpaid of mixed.filter((row) => row.pickedUpAt !== null && row.paidAt === null)) {
      expect(unpaid).toContain(pickedUnpaid.publicCode);
    }
    const selfPending = (await allOlder({ queue: "SELF_PICKUP_PENDING" })).codes;
    for (const unpickedUnpaid of mixed.filter((row) => row.status === "PLACED" && row.fulfillmentMethod === "SELF_PICKUP" && row.pickedUpAt === null && row.paidAt === null)) {
      expect(selfPending).toContain(unpickedUnpaid.publicCode);
    }
  });

  test("anchor remains usable after payment removes it from the unpaid queue", async () => {
    await db.order.createMany({ data: Array.from({ length: 70 }, () => orderData()) });
    const original = await expectedCodes({ status: "PLACED", cancelledAt: null, paidAt: null });
    const first = await page({ queue: "UNPAID" });
    await db.order.update({ where: { publicCode: first.olderCursor! }, data: { paidAt: tiedAt } });
    const older = await page({ queue: "UNPAID", navigation: { direction: "OLDER", anchorPublicCode: first.olderCursor } });
    expect(older.items.map((row) => row.publicCode)).toEqual(original.slice(50, 100));
    expect(older.hasNewer).toBe(true);
  });

  test("exact search, unknown valid cursor and safe DTO work against PostgreSQL", async () => {
    const created = await db.order.create({ data: orderData() });
    const found = await page({ orderNumber: created.orderNumber });
    expect(found.items.map((row) => row.publicCode)).toEqual([created.publicCode]);
    expect(found.hasOlder).toBe(false);
    expect(found.hasNewer).toBe(false);
    expect(found.items[0]).not.toHaveProperty("id");
    expect(JSON.stringify(found)).not.toMatch(/accessToken|password|cost|shipments/);
    expect((await page({ orderNumber: "000000000000" })).items).toEqual([]);
    await expect(list({ navigation: { direction: "OLDER", anchorPublicCode: `ord-${randomBytes(12).toString("base64url")}` } }))
      .resolves.toEqual({ ok: false, error: "INVALID_CURSOR" });
  });
});
