// @vitest-environment node

import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

const tx = vi.hoisted(() => ({
  groupBuy: { findUnique: vi.fn() },
  groupBuyPickup: { findUnique: vi.fn() },
  groupBuyItem: { findMany: vi.fn(), updateMany: vi.fn() },
  customer: { findUnique: vi.fn(), upsert: vi.fn() },
  order: { create: vi.fn() },
  orderItem: { aggregate: vi.fn(), createMany: vi.fn() },
  sevenElevenStoreSelection: { findFirst: vi.fn(), updateMany: vi.fn() },
}));
const db = vi.hoisted(() => ({ $transaction: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));

import { Prisma } from "@/generated/prisma/client";
import { OrderDomainError } from "@/lib/orders/errors";
import { createOrder } from "@/lib/orders/service";

const now = new Date("2026-09-14T04:00:00.000Z");
const slug = "gb-AbCdEf0123_-xyZ9";
const groupBuyId = "00000000-0000-4000-8000-000000000001";
const pickupId = "11111111-1111-4111-8111-111111111111";
const itemAId = "22222222-2222-4222-8222-aaaaaaaaaaaa";
const itemBId = "22222222-2222-4222-8222-bbbbbbbbbbbb";

function input(overrides: Record<string, unknown> = {}) {
  return {
    customerName: " 王小明 ",
    customerPhone: "0912-345-678",
    groupBuyPickupId: pickupId,
    items: [{ groupBuyItemId: itemAId, expectedUnitPrice: 150, quantity: 1 }],
    ...overrides,
  };
}

function groupBuy(overrides: Record<string, unknown> = {}) {
  return {
    id: groupBuyId,
    status: "PUBLISHED",
    startAt: new Date("2026-09-14T03:00:00.000Z"),
    endAt: new Date("2026-09-14T05:00:00.000Z"),
    ...overrides,
  };
}

function pickup(overrides: Record<string, unknown> = {}) {
  return {
    id: pickupId,
    groupBuyId,
    pickupStartAt: new Date("2026-09-15T01:00:00.000Z"),
    pickupEndAt: new Date("2026-09-15T03:00:00.000Z"),
    pickupLocation: { name: "一號店", address: "台北市中正區", isActive: true },
    ...overrides,
  };
}

function item(id = itemAId, overrides: Record<string, unknown> = {}) {
  return {
    id,
    groupBuyId,
    salePrice: 150,
    stock: 10,
    purchaseLimit: null,
    isActive: true,
    product: { name: id === itemAId ? "蘋果" : "橘子", unit: "袋", isActive: true },
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  tx.groupBuy.findUnique.mockResolvedValue(groupBuy());
  tx.groupBuyPickup.findUnique.mockResolvedValue(pickup());
  tx.groupBuyItem.findMany.mockResolvedValue([item()]);
  tx.customer.findUnique.mockResolvedValue({ id: "customer-existing" });
  tx.customer.upsert.mockResolvedValue({ id: "customer-created" });
  tx.orderItem.aggregate.mockResolvedValue({ _sum: { quantity: null } });
  tx.order.create.mockResolvedValue({ id: "order-id" });
  tx.groupBuyItem.updateMany.mockResolvedValue({ count: 1 });
  tx.orderItem.createMany.mockResolvedValue({ count: 1 });
  tx.sevenElevenStoreSelection.updateMany.mockResolvedValue({ count: 1 });
});

afterAll(() => vi.useRealTimers());

test("invalid slug maps to INVALID_ORDER_INPUT before any database transaction", async () => {
  await expectCode(createOrder("bad", input()), "INVALID_ORDER_INPUT");
  expect(db.$transaction).not.toHaveBeenCalled();
});

test("invalid order input maps to INVALID_ORDER_INPUT before any database transaction", async () => {
  await expectCode(createOrder(slug, input({ items: [] })), "INVALID_ORDER_INPUT");
  expect(db.$transaction).not.toHaveBeenCalled();
});

test.each([
  ["missing", null],
  ["DRAFT", groupBuy({ status: "DRAFT" })],
  ["scheduled", groupBuy({ startAt: new Date(now.getTime() + 1) })],
])("%s group buy is not orderable", async (_label, row) => {
  tx.groupBuy.findUnique.mockResolvedValue(row);
  await expectCode(createOrder(slug, input()), "GROUP_BUY_NOT_ORDERABLE");
});

test("startAt is inclusive", async () => {
  tx.groupBuy.findUnique.mockResolvedValue(groupBuy({ startAt: now }));
  await expect(createOrder(slug, input())).resolves.toMatchObject({ status: "PLACED" });
});

test("endAt is exclusive", async () => {
  tx.groupBuy.findUnique.mockResolvedValue(groupBuy({ endAt: now }));
  await expectCode(createOrder(slug, input()), "GROUP_BUY_NOT_ORDERABLE");
});

test.each([
  ["missing", null],
  ["wrong group", pickup({ groupBuyId: "00000000-0000-4000-8000-000000000099" })],
  ["inactive location", pickup({ pickupLocation: { name: "停用", address: "台北", isActive: false } })],
])("%s pickup is unavailable", async (_label, row) => {
  tx.groupBuyPickup.findUnique.mockResolvedValue(row);
  await expectCode(createOrder(slug, input()), "PICKUP_NOT_AVAILABLE");
});

test.each([
  ["missing", []],
  ["wrong group", [item(itemAId, { groupBuyId: "00000000-0000-4000-8000-000000000099" })]],
  ["inactive item", [item(itemAId, { isActive: false })]],
  ["inactive Product", [item(itemAId, { product: { name: "停用", unit: "袋", isActive: false } })]],
])("%s item is unavailable", async (_label, rows) => {
  tx.groupBuyItem.findMany.mockResolvedValue(rows);
  await expectCode(createOrder(slug, input()), "ITEM_NOT_AVAILABLE");
});

test("rejects a stale displayed price before any customer or order writes", async () => {
  tx.groupBuyItem.findMany.mockResolvedValue([item(itemAId, { salePrice: 175 })]);

  await expectCode(createOrder(slug, input()), "PRICE_CHANGED");

  expect(tx.customer.findUnique).not.toHaveBeenCalled();
  expect(tx.customer.upsert).not.toHaveBeenCalled();
  expect(tx.order.create).not.toHaveBeenCalled();
  expect(tx.groupBuyItem.updateMany).not.toHaveBeenCalled();
  expect(tx.orderItem.createMany).not.toHaveBeenCalled();
});

test("reuses an existing Customer", async () => {
  await createOrder(slug, input());
  expect(tx.customer.findUnique).toHaveBeenCalledWith({
    where: { phone: "+886912345678" },
    select: { id: true },
  });
  expect(tx.customer.upsert).not.toHaveBeenCalled();
  expect(tx.order.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ customerId: "customer-existing" }),
  }));
});

test("uses upsert for an absent Customer", async () => {
  tx.customer.findUnique.mockResolvedValue(null);
  await createOrder(slug, input());
  expect(tx.customer.upsert).toHaveBeenCalledWith({
    where: { phone: "+886912345678" },
    create: { phone: "+886912345678" },
    update: {},
    select: { id: true },
  });
  expect(tx.order.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ customerId: "customer-created" }),
  }));
});

test("purchaseLimit null skips aggregate and finite rejection", async () => {
  await expect(createOrder(slug, input())).resolves.toMatchObject({ status: "PLACED" });
  expect(tx.orderItem.aggregate).not.toHaveBeenCalled();
});

test("purchaseLimit zero rejects every positive quantity", async () => {
  tx.groupBuyItem.findMany.mockResolvedValue([item(itemAId, { purchaseLimit: 0 })]);
  await expectCode(createOrder(slug, input()), "PURCHASE_LIMIT_EXCEEDED");
  expect(tx.order.create).not.toHaveBeenCalled();
});

test("finite purchaseLimit exact boundary succeeds and filters consumed orders to PLACED", async () => {
  tx.groupBuyItem.findMany.mockResolvedValue([item(itemAId, { purchaseLimit: 5 })]);
  tx.orderItem.aggregate.mockResolvedValue({ _sum: { quantity: 3 } });
  await expect(createOrder(slug, input({
    items: [{ groupBuyItemId: itemAId, expectedUnitPrice: 150, quantity: 2 }],
  }))).resolves.toMatchObject({ status: "PLACED" });
  expect(tx.orderItem.aggregate).toHaveBeenCalledWith({
    where: {
      groupBuyItemId: itemAId,
      order: { customerId: "customer-existing", groupBuyId, status: "PLACED" },
    },
    _sum: { quantity: true },
  });
});

test("finite purchaseLimit rejects an exceeded total before writes", async () => {
  tx.groupBuyItem.findMany.mockResolvedValue([item(itemAId, { purchaseLimit: 5 })]);
  tx.orderItem.aggregate.mockResolvedValue({ _sum: { quantity: 4 } });
  await expectCode(createOrder(slug, input({
    items: [{ groupBuyItemId: itemAId, expectedUnitPrice: 150, quantity: 2 }],
  })), "PURCHASE_LIMIT_EXCEEDED");
  expect(tx.customer.upsert).not.toHaveBeenCalled();
  expect(tx.order.create).not.toHaveBeenCalled();
  expect(tx.groupBuyItem.updateMany).not.toHaveBeenCalled();
});

test.each([-1, Number.MAX_SAFE_INTEGER + 1, 1.5])(
  "fails closed for corrupt aggregate quantity %s",
  async (quantity) => {
    tx.groupBuyItem.findMany.mockResolvedValue([item(itemAId, { purchaseLimit: 5 })]);
    tx.orderItem.aggregate.mockResolvedValue({ _sum: { quantity } });
    await expectCode(createOrder(slug, input()), "FAILED");
  },
);

test("stock null does not issue a decrement", async () => {
  tx.groupBuyItem.findMany.mockResolvedValue([item(itemAId, { stock: null })]);
  await createOrder(slug, input());
  expect(tx.groupBuyItem.updateMany).not.toHaveBeenCalled();
});

test("finite stock uses an atomic conditional decrement", async () => {
  await createOrder(slug, input({ items: [{ groupBuyItemId: itemAId, expectedUnitPrice: 150, quantity: 3 }] }));
  expect(tx.groupBuyItem.updateMany).toHaveBeenCalledWith({
    where: { id: itemAId, groupBuyId, stock: { gte: 3 } },
    data: { stock: { decrement: 3 } },
  });
});

test("conditional stock allocation count zero rejects", async () => {
  tx.groupBuyItem.updateMany.mockResolvedValue({ count: 0 });
  await expectCode(createOrder(slug, input()), "INSUFFICIENT_STOCK");
  expect(tx.orderItem.createMany).not.toHaveBeenCalled();
});

test("reversed request input uses canonical UUID lexical ascending order for finite-stock mutations", async () => {
  tx.groupBuyItem.findMany.mockResolvedValue([
    item(itemBId, { purchaseLimit: 5 }),
    item(itemAId, { purchaseLimit: 5 }),
  ]);
  tx.orderItem.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
  await createOrder(slug, input({ items: [
    { groupBuyItemId: itemBId.toUpperCase(), expectedUnitPrice: 150, quantity: 2 },
    { groupBuyItemId: itemAId.toUpperCase(), expectedUnitPrice: 150, quantity: 1 },
  ] }));

  expect(itemBId.toUpperCase()).not.toBe(itemBId);
  expect(tx.orderItem.aggregate.mock.calls.map(([query]) => query.where.groupBuyItemId))
    .toEqual([itemAId, itemBId]);
  expect(tx.groupBuyItem.updateMany.mock.calls.map(([query]) => query.where.id))
    .toEqual([itemAId, itemBId]);
  expect(tx.orderItem.createMany.mock.calls[0][0].data.map((line: { groupBuyItemId: string }) => line.groupBuyItemId))
    .toEqual([itemAId, itemBId]);
});

test("uses DB-authoritative prices and snapshots and returns only the public projection", async () => {
  const result = await createOrder(slug, input());
  expect(tx.order.create).toHaveBeenCalledWith({
    data: {
      publicCode: expect.stringMatching(/^ord-[A-Za-z0-9_-]{16}$/),
      accessTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      groupBuyId,
      customerId: "customer-existing",
      groupBuyPickupId: pickupId,
      status: "PLACED",
      fulfillmentMethod: "SELF_PICKUP",
      customerName: "王小明",
      customerPhone: "+886912345678",
      pickupName: "一號店",
      pickupAddress: "台北市中正區",
      pickupStartAt: new Date("2026-09-15T01:00:00.000Z"),
      pickupEndAt: new Date("2026-09-15T03:00:00.000Z"),
      sevenElevenStoreId: null,
      sevenElevenStoreName: null,
      sevenElevenStoreAddress: null,
      totalAmount: 150,
    },
    select: { id: true },
  });
  expect(tx.orderItem.createMany).toHaveBeenCalledWith({ data: [{
    orderId: "order-id",
    groupBuyItemId: itemAId,
    productName: "蘋果",
    unit: "袋",
    unitPrice: 150,
    quantity: 1,
  }] });
  expect(result).toEqual({
    publicCode: expect.stringMatching(/^ord-[A-Za-z0-9_-]{16}$/),
    status: "PLACED",
    totalAmount: 150,
    accessToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
  });
  expect(Object.keys(result).sort()).toEqual(["accessToken", "publicCode", "status", "totalAmount"]);
  const persisted = tx.order.create.mock.calls[0][0].data;
  expect(persisted.accessTokenHash).not.toBe(result.accessToken);
  expect(JSON.stringify(tx.order.create.mock.calls)).not.toContain(result.accessToken);
});

test("7-ELEVEN order atomically snapshots and consumes only the server-side selection", async () => {
  tx.groupBuy.findUnique.mockResolvedValue(groupBuy({ allowsSelfPickup: false, allowsSevenEleven: true }));
  tx.sevenElevenStoreSelection.findFirst.mockResolvedValue({
    id: "selection-id",
    storeId: "123456",
    storeName: "權威門市",
    storeAddress: "臺北市權威路 1 號",
  });
  await createOrder(slug, {
    customerName: "王小明",
    customerPhone: "0912-345-678",
    fulfillmentMethod: "SEVEN_ELEVEN",
    storeSelectionToken: "A".repeat(43),
    items: [{ groupBuyItemId: itemAId, expectedUnitPrice: 150, quantity: 1 }],
  }, { storeSelectionBinding: "B".repeat(43) });
  expect(tx.groupBuyPickup.findUnique).not.toHaveBeenCalled();
  expect(tx.order.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    fulfillmentMethod: "SEVEN_ELEVEN",
    groupBuyPickupId: null,
    pickupName: null,
    sevenElevenStoreId: "123456",
    sevenElevenStoreName: "權威門市",
    sevenElevenStoreAddress: "臺北市權威路 1 號",
  }) }));
  expect(tx.sevenElevenStoreSelection.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ id: "selection-id", consumedAt: null }),
    data: expect.objectContaining({ orderId: "order-id" }),
  }));
});

test("7-ELEVEN order rejects missing, expired, reused, or unbound selections before Order creation", async () => {
  tx.groupBuy.findUnique.mockResolvedValue(groupBuy({ allowsSevenEleven: true }));
  tx.sevenElevenStoreSelection.findFirst.mockResolvedValue(null);
  await expectCode(createOrder(slug, {
    customerName: "王小明",
    customerPhone: "0912-345-678",
    fulfillmentMethod: "SEVEN_ELEVEN",
    storeSelectionToken: "A".repeat(43),
    items: [{ groupBuyItemId: itemAId, expectedUnitPrice: 150, quantity: 1 }],
  }, { storeSelectionBinding: "B".repeat(43) }), "STORE_SELECTION_INVALID");
  expect(tx.order.create).not.toHaveBeenCalled();
});

test("reuses one access token hash across whole-transaction retries", async () => {
  const writes: string[] = [];
  let attempt = 0;
  db.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => {
    attempt += 1;
    const value = await callback(tx);
    writes.push(tx.order.create.mock.calls.at(-1)?.[0].data.accessTokenHash);
    if (attempt === 1) {
      throw new Prisma.PrismaClientKnownRequestError("serialization", {
        code: "P2034",
        clientVersion: "test",
      });
    }
    return value;
  });

  const result = await createOrder(slug, input());

  expect(writes).toHaveLength(2);
  expect(writes[0]).toBe(writes[1]);
  expect(result.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

test("strict validation prevents clients from controlling snapshots, prices, or totals", async () => {
  await expectCode(createOrder(slug, input({ totalAmount: 1 })), "INVALID_ORDER_INPUT");
  await expectCode(createOrder(slug, input({ items: [{
    groupBuyItemId: itemAId,
    expectedUnitPrice: 150,
    quantity: 1,
    unitPrice: 1,
  }] })), "INVALID_ORDER_INPUT");
  expect(db.$transaction).not.toHaveBeenCalled();
});

test("money overflow maps to INVALID_ORDER_INPUT and rolls back before Order creation", async () => {
  tx.groupBuyItem.findMany.mockResolvedValue([item(itemAId, { salePrice: 2_147_483_647 })]);
  await expectCode(createOrder(slug, input({
    items: [{ groupBuyItemId: itemAId, expectedUnitPrice: 2_147_483_647, quantity: 2 }],
  })), "INVALID_ORDER_INPUT");
  expect(tx.order.create).not.toHaveBeenCalled();
});

test("wraps the complete attempt in a Serializable interactive transaction", async () => {
  await createOrder(slug, input());
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect(db.$transaction.mock.calls[0][0]).toEqual(expect.any(Function));
  expect(db.$transaction.mock.calls[0][1]).toEqual({
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
});

describe("attempt-local server time", () => {
  test("reads lifecycle with the transaction attempt's server-generated now", async () => {
    tx.groupBuy.findUnique.mockResolvedValue(groupBuy({
      startAt: now,
      endAt: new Date(now.getTime() + 1),
    }));
    await expect(createOrder(slug, input())).resolves.toMatchObject({ status: "PLACED" });
  });
});

test("unexpected transaction failures are mapped without leaking details", async () => {
  db.$transaction.mockRejectedValue(new Error("sensitive SQL detail"));
  const rejection = createOrder(slug, input());
  await expectCode(rejection, "FAILED");
  await expect(rejection).rejects.toBeInstanceOf(OrderDomainError);
});
