// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  getDb: vi.fn(), transaction: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(),
  findFirst: vi.fn(), count: vi.fn(), queryRaw: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: boundary.getDb }));

import { adminOrderListSelect, listAdminOrders } from "@/lib/orders/admin-service";

const createdAt = new Date("2026-10-02T01:00:00Z");
const anchorCode = "ord-AbCdEf0123_-xyZ9";
const anchor = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", createdAt };

function row(number: number, patch: Record<string, unknown> = {}) {
  return {
    publicCode: `ord-${String(number).padStart(16, "0")}`,
    orderNumber: `20261002${String(number).padStart(4, "0")}`,
    status: "PLACED" as const,
    fulfillmentMethod: "SELF_PICKUP" as const,
    customerName: "管理員列表顧客",
    customerPhone: "+886912345678",
    totalAmount: 300,
    createdAt,
    cancelledAt: null, pickedUpAt: null, paidAt: null,
    groupBuy: { title: "團購" },
    ...patch,
  };
}

const rows = [row(2), row(1)];
const transactionClient = {
  order: {
    findMany: boundary.findMany, findUnique: boundary.findUnique,
    findFirst: boundary.findFirst, count: boundary.count,
  },
  $queryRaw: boundary.queryRaw,
};

beforeEach(() => {
  vi.resetAllMocks();
  boundary.getDb.mockReturnValue({ $transaction: boundary.transaction });
  boundary.transaction.mockImplementation(async (callback) => callback(transactionClient));
  boundary.findMany.mockResolvedValue(rows);
  boundary.findUnique.mockImplementation(async ({ where }) => {
    if (where.publicCode === anchorCode) return anchor;
    return { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", createdAt };
  });
  boundary.findFirst.mockResolvedValue(null);
});

test("default query is bounded, uses stable newest-first ordering and a coherent read transaction", async () => {
  await expect(listAdminOrders()).resolves.toEqual({ ok: true, value: {
    items: rows, pageSize: 50, returnedCount: 2,
    hasOlder: false, hasNewer: false, olderCursor: null, newerCursor: null,
  } });
  expect(boundary.findMany).toHaveBeenCalledExactlyOnceWith({
    where: {}, select: adminOrderListSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51,
  });
  expect(boundary.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead" });
  expect(boundary.count).not.toHaveBeenCalled();
  expect(boundary.queryRaw).not.toHaveBeenCalled();
});

test("exact order-number search is an equality predicate and retains the shared result contract", async () => {
  boundary.findMany.mockResolvedValue([rows[0]]);
  await expect(listAdminOrders({ orderNumber: rows[0].orderNumber })).resolves.toMatchObject({
    ok: true, value: { items: [rows[0]], pageSize: 50, returnedCount: 1 },
  });
  expect(boundary.findMany.mock.calls[0][0].where).toEqual({ orderNumber: rows[0].orderNumber });
});

test.each(["PLACED", "CANCELLED"])("status %s reaches the database predicate", async (status) => {
  await listAdminOrders({ status });
  expect(boundary.findMany.mock.calls[0][0].where).toEqual({ status });
});

test.each(["SELF_PICKUP", "SEVEN_ELEVEN"])("fulfillment %s reaches the database predicate", async (fulfillment) => {
  await listAdminOrders({ fulfillment });
  expect(boundary.findMany.mock.calls[0][0].where).toEqual({ fulfillmentMethod: fulfillment });
});

test("UNPAID includes a legitimately picked-up order and has no pickup or cutoff gate", async () => {
  const pickedUnpaid = row(3, { pickedUpAt: createdAt });
  boundary.findMany.mockResolvedValue([pickedUnpaid]);
  await expect(listAdminOrders({ queue: "UNPAID" })).resolves.toMatchObject({ ok: true, value: { items: [pickedUnpaid] } });
  expect(boundary.findMany.mock.calls[0][0].where).toEqual({ status: "PLACED", cancelledAt: null, paidAt: null });
});

test.each([null, createdAt])("SELF_PICKUP_PENDING accepts paidAt=%s without any payment or time gate", async (paidAt) => {
  const pendingPickup = row(3, { paidAt });
  boundary.findMany.mockResolvedValue([pendingPickup]);
  await expect(listAdminOrders({ queue: "SELF_PICKUP_PENDING" }))
    .resolves.toMatchObject({ ok: true, value: { items: [pendingPickup] } });
  expect(boundary.findMany.mock.calls[0][0].where).toEqual({
    status: "PLACED", cancelledAt: null, fulfillmentMethod: "SELF_PICKUP", pickedUpAt: null,
  });
});

test("all normal conditions constrain the same query with AND semantics", async () => {
  await listAdminOrders({ orderNumber: rows[0].orderNumber, status: "PLACED", fulfillment: "SEVEN_ELEVEN", queue: "UNPAID" });
  expect(boundary.findMany.mock.calls[0][0].where).toEqual({
    orderNumber: rows[0].orderNumber, status: "PLACED", fulfillmentMethod: "SEVEN_ELEVEN", cancelledAt: null, paidAt: null,
  });
});

test.each([
  null, "query", [], 123,
  { orderNumber: "20261002" }, { orderNumber: "x".repeat(10_000) },
  { orderNumber: ["202610020001", "202610020002"] },
  { status: "ALL" }, { fulfillment: "UNKNOWN" }, { queue: "PAID" },
  { queue: "UNPAID", status: "CANCELLED" },
  { queue: "SELF_PICKUP_PENDING", status: "CANCELLED" },
  { queue: "SELF_PICKUP_PENDING", fulfillment: "SEVEN_ELEVEN" },
  { navigation: { direction: "OLDER", anchorPublicCode: "bad" } },
  { navigation: { direction: "OLD", anchorPublicCode: anchorCode } },
  { navigation: { direction: "OLDER", anchorPublicCode: anchorCode, before: anchorCode } },
  { customerPhone: "+886912345678" }, { customerName: "PII" },
  { skip: 50 }, { take: 100 }, { page: 999 },
])("service validates unknown input before any database access: %j", async (input) => {
  await expect(listAdminOrders(input)).resolves.toEqual({ ok: false, error: "INVALID_QUERY" });
  expect(boundary.getDb).not.toHaveBeenCalled();
  expect(boundary.transaction).not.toHaveBeenCalled();
  expect(boundary.findMany).not.toHaveBeenCalled();
});

test("OLDER uses both strict tuple keys, then applies current queue independently of anchor membership", async () => {
  await listAdminOrders({ queue: "UNPAID", navigation: { direction: "OLDER", anchorPublicCode: anchorCode } });
  expect(boundary.findUnique.mock.calls[0][0]).toEqual({
    where: { publicCode: anchorCode }, select: { id: true, createdAt: true },
  });
  expect(boundary.findMany.mock.calls[0][0]).toMatchObject({
    where: { AND: [
      { status: "PLACED", cancelledAt: null, paidAt: null },
      { OR: [ { createdAt: { lt: createdAt } }, { createdAt, id: { lt: anchor.id } } ] },
    ] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51,
  });
});

test("NEWER queries nearest rows ascending, discards the extra newest row, then reverses display", async () => {
  const ascending = Array.from({ length: 51 }, (_, index) => row(index + 41));
  boundary.findMany.mockResolvedValue(ascending);
  boundary.findFirst.mockResolvedValue({ publicCode: anchorCode });
  const result = await listAdminOrders({ navigation: { direction: "NEWER", anchorPublicCode: anchorCode } });
  expect(boundary.findMany.mock.calls[0][0]).toMatchObject({
    where: { AND: [ {}, { OR: [ { createdAt: { gt: createdAt } }, { createdAt, id: { gt: anchor.id } } ] } ] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 51,
  });
  expect(result).toMatchObject({ ok: true, value: {
    items: ascending.slice(0, 50).reverse(), returnedCount: 50, hasNewer: true,
    newerCursor: ascending[49].publicCode,
  } });
  if (result.ok) expect(result.value.items.map((item) => item.publicCode)).not.toContain(ascending[50].publicCode);
});

test("the 51st older row only establishes continuation and never reaches the DTO", async () => {
  const descending = Array.from({ length: 51 }, (_, index) => row(100 - index));
  boundary.findMany.mockResolvedValue(descending);
  await expect(listAdminOrders()).resolves.toEqual({ ok: true, value: {
    items: descending.slice(0, 50), pageSize: 50, returnedCount: 50,
    hasOlder: true, hasNewer: false, olderCursor: descending[49].publicCode, newerCursor: null,
  } });
});

test.each(["OLDER", "NEWER"])("a missing %s anchor is INVALID_CURSOR and never silently resets", async (direction) => {
  boundary.findUnique.mockResolvedValueOnce(null);
  await expect(listAdminOrders({ navigation: { direction, anchorPublicCode: anchorCode } }))
    .resolves.toEqual({ ok: false, error: "INVALID_CURSOR" });
  expect(boundary.findMany).not.toHaveBeenCalled();
  expect(boundary.findFirst).not.toHaveBeenCalled();
});

test.each([null, { publicCode: anchorCode }])("prior-direction metadata uses actual bounded existence: %j", async (existing) => {
  boundary.findFirst.mockResolvedValue(existing);
  const result = await listAdminOrders({ queue: "UNPAID", navigation: { direction: "OLDER", anchorPublicCode: anchorCode } });
  expect(result).toMatchObject({ ok: true, value: {
    hasNewer: existing !== null, newerCursor: existing ? rows[0].publicCode : null,
  } });
  expect(boundary.findFirst).toHaveBeenCalled();
  for (const [query] of boundary.findFirst.mock.calls) {
    expect(query.select).toEqual({ publicCode: true });
    expect(query.where.AND[0]).toEqual({ status: "PLACED", cancelledAt: null, paidAt: null });
    expect(query.where.AND[1].OR).toEqual([
      { createdAt: { gt: createdAt } },
      { createdAt, id: { gt: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } },
    ]);
  }
  expect(boundary.count).not.toHaveBeenCalled();
});

test("a valid empty filtered query returns success with truthful empty initial metadata", async () => {
  boundary.findMany.mockResolvedValue([]);
  await expect(listAdminOrders({ status: "CANCELLED" })).resolves.toEqual({ ok: true, value: {
    items: [], pageSize: 50, returnedCount: 0,
    hasOlder: false, hasNewer: false, olderCursor: null, newerCursor: null,
  } });
});

test.each([
  ["OLDER", false, true], ["NEWER", true, false],
] as const)("empty exhausted %s page exposes recovery only when opposite matches exist", async (direction, hasOlder, hasNewer) => {
  boundary.findMany.mockResolvedValue([]);
  boundary.findFirst.mockResolvedValueOnce({ publicCode: rows[0].publicCode });
  await expect(listAdminOrders({ queue: "UNPAID", navigation: { direction, anchorPublicCode: anchorCode } }))
    .resolves.toEqual({ ok: true, value: {
      items: [], pageSize: 50, returnedCount: 0, hasOlder, hasNewer,
      olderCursor: hasOlder ? anchorCode : null, newerCursor: hasNewer ? anchorCode : null,
    } });
  boundary.findFirst.mockResolvedValueOnce(null);
  await expect(listAdminOrders({ queue: "UNPAID", navigation: { direction, anchorPublicCode: anchorCode } }))
    .resolves.toEqual({ ok: true, value: {
      items: [], pageSize: 50, returnedCount: 0,
      hasOlder: false, hasNewer: false, olderCursor: null, newerCursor: null,
    } });
  expect(boundary.count).not.toHaveBeenCalled();
});

test("exactly 50 rows do not invent an older page without the sentinel", async () => {
  boundary.findMany.mockResolvedValue(Array.from({ length: 50 }, (_, index) => row(100 - index)));
  await expect(listAdminOrders()).resolves.toMatchObject({ ok: true, value: {
    returnedCount: 50, hasOlder: false, olderCursor: null, hasNewer: false, newerCursor: null,
  } });
});

test("invalid stored dates or a vanished display boundary fail safely", async () => {
  boundary.findUnique.mockResolvedValueOnce({ ...anchor, createdAt: new Date("bad") });
  await expect(listAdminOrders({ navigation: { direction: "OLDER", anchorPublicCode: anchorCode } }))
    .resolves.toEqual({ ok: false, error: "FAILED" });
  expect(boundary.findMany).not.toHaveBeenCalled();
  boundary.findUnique.mockResolvedValueOnce(anchor).mockResolvedValueOnce(null);
  await expect(listAdminOrders({ navigation: { direction: "OLDER", anchorPublicCode: anchorCode } }))
    .resolves.toEqual({ ok: false, error: "FAILED" });
  expect(boundary.findFirst).not.toHaveBeenCalled();
});

test("the explicit DTO strips internal and unrelated fields even if a mock returns excess properties", async () => {
  boundary.findMany.mockResolvedValue([{ ...rows[0],
    id: anchor.id, accessTokenHash: "private-hash", cost: 123, items: [{ secret: true }],
    shipments: [{ trackingNumber: "private-tracking" }], shipmentRequired: true,
    groupBuy: { title: "團購", id: "private-group-id", cost: 123 },
  }]);
  const result = await listAdminOrders();
  expect(result).toMatchObject({ ok: true, value: { items: [rows[0]] } });
  const serialized = JSON.stringify(result);
  expect(serialized).not.toMatch(/private-|"id"|accessToken|"cost"|shipment|tracking|"secret"/);
  expect(adminOrderListSelect).not.toHaveProperty("id");
  expect(adminOrderListSelect).not.toHaveProperty("items");
  expect(adminOrderListSelect).not.toHaveProperty("shipments");
});

test.each([
  { orderNumber: "bad" }, { status: "PLACED", cancelledAt: createdAt },
  { status: "CANCELLED", cancelledAt: null },
  { status: "CANCELLED", cancelledAt: createdAt, paidAt: createdAt },
  { status: "CANCELLED", cancelledAt: createdAt, pickedUpAt: createdAt },
])("existing order invariants fail closed in the list: %j", async (patch) => {
  boundary.findMany.mockResolvedValue([row(2, patch)]);
  await expect(listAdminOrders()).resolves.toEqual({ ok: false, error: "FAILED" });
});

test.each(["anchor", "list", "existence", "transaction"])("%s failure is sanitized", async (stage) => {
  const error = new Error("private SQL customerPhone internal-id");
  if (stage === "anchor") boundary.findUnique.mockRejectedValueOnce(error);
  if (stage === "list") boundary.findMany.mockRejectedValueOnce(error);
  if (stage === "existence") boundary.findFirst.mockRejectedValueOnce(error);
  if (stage === "transaction") boundary.transaction.mockRejectedValueOnce(error);
  await expect(listAdminOrders({ navigation: { direction: "OLDER", anchorPublicCode: anchorCode } }))
    .resolves.toEqual({ ok: false, error: "FAILED" });
});
