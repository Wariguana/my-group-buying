// @vitest-environment node

import { afterEach, beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  getDb: vi.fn(), transaction: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(),
  findFirst: vi.fn(), count: vi.fn(), queryRaw: vi.fn(), openShipments: vi.fn(), returnedOrders: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: boundary.getDb }));

import { adminOrderListSelect, listAdminOrders } from "@/lib/orders/admin-service";

const createdAt = new Date("2026-10-02T01:00:00Z");
const anchorCode = "ord-AbCdEf0123_-xyZ9";
const anchor = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", createdAt };
const shipmentQueues = ["SHIPMENT_TO_CREATE", "SHIPMENT_CREATED", "SHIPMENT_SHIPPED", "SHIPMENT_ARRIVED", "SHIPMENT_RETURNED"] as const;

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
    shipmentRequired: false, shipmentState: null, hasReturnedShipmentHistory: false,
    groupBuy: { title: "團購" },
    ...patch,
  };
}

const rows = [row(2), row(1)];
const transactionClient = {
  order: {
    findMany: async (query: { select: { publicCode?: boolean } }) => query.select.publicCode
      ? (await boundary.findMany(query)).map((item: ReturnType<typeof row>) => ({ id: item.publicCode, shipments: [], ...item }))
      : boundary.returnedOrders(query),
    findUnique: boundary.findUnique,
    findFirst: boundary.findFirst, count: boundary.count,
  },
  shipment: { findMany: boundary.openShipments },
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
  boundary.openShipments.mockResolvedValue([]);
  boundary.returnedOrders.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

test.each(shipmentQueues)("%s independently rejects contradictions before accessing any Order query", async (queue) => {
  for (const contradiction of [{ status: "CANCELLED" }, { fulfillment: "SELF_PICKUP" }]) {
    await expect(listAdminOrders({ queue, ...contradiction })).resolves.toEqual({ ok: false, error: "INVALID_QUERY" });
  }
  expect(boundary.getDb).not.toHaveBeenCalled();
});

test.each(shipmentQueues)("%s applies its complete relational predicate before take 51 without payment/pickup-window restrictions", async (queue) => {
  vi.useFakeTimers(); vi.setSystemTime(createdAt);
  await listAdminOrders({ queue, status: "PLACED", fulfillment: "SEVEN_ELEVEN" });
  const open = { returnedAt: null, voidedAt: null };
  const specifics = {
    SHIPMENT_TO_CREATE: { groupBuy: { endAt: { lte: createdAt } }, AND: [
      { shipments: { none: open } }, { shipments: { none: { returnedAt: { not: null } } } },
    ] },
    SHIPMENT_CREATED: { shipments: { some: { ...open, shippedAt: null, arrivedAt: null } } },
    SHIPMENT_SHIPPED: { shipments: { some: { ...open, shippedAt: { not: null }, arrivedAt: null } } },
    SHIPMENT_ARRIVED: { shipments: { some: { ...open, shippedAt: { not: null }, arrivedAt: { not: null } } } },
    SHIPMENT_RETURNED: { AND: [
      { shipments: { none: open } }, { shipments: { some: { returnedAt: { not: null } } } },
    ] },
  };
  expect(boundary.findMany.mock.calls[0][0]).toMatchObject({
    take: 51, where: { status: "PLACED", cancelledAt: null, fulfillmentMethod: "SEVEN_ELEVEN",
      shipmentRequired: true, pickedUpAt: null, ...specifics[queue] },
  });
  expect(Object.keys(boundary.findMany.mock.calls[0][0].where).sort()).toEqual([
    "status", "cancelledAt", "fulfillmentMethod", "shipmentRequired", "pickedUpAt", ...Object.keys(specifics[queue]),
  ].sort());
});

test("TO_CREATE shares one serverNow across the page and opposite existence even while the clock advances", async () => {
  vi.useFakeTimers(); vi.setSystemTime(createdAt);
  boundary.findMany.mockImplementation(async () => { vi.setSystemTime(new Date(createdAt.getTime() + 5000)); return rows; });
  await listAdminOrders({ queue: "SHIPMENT_TO_CREATE", navigation: { direction: "OLDER", anchorPublicCode: anchorCode } });
  const pageFilters = boundary.findMany.mock.calls[0][0].where.AND[0];
  expect(pageFilters.groupBuy.endAt.lte).toEqual(createdAt);
  expect(boundary.findFirst.mock.calls[0][0].where.AND[0]).toBe(pageFilters);
});

test.each([-1, 0, 1])("TO_CREATE uses the inclusive live GroupBuy cutoff at serverNow offset %s", async (offset) => {
  vi.useFakeTimers();
  const serverNow = new Date(createdAt.getTime() + offset);
  vi.setSystemTime(serverNow);
  await listAdminOrders({ queue: "SHIPMENT_TO_CREATE" });
  const predicate = boundary.findMany.mock.calls[0][0].where.groupBuy;
  expect(predicate).toEqual({ endAt: { lte: serverNow } });
  expect(createdAt <= predicate.endAt.lte).toBe(offset >= 0);
  // The database compares its current relation value on every request. An
  // extended GroupBuy cutoff excludes the same order without changing now.
  const extendedEndAt = new Date(createdAt.getTime() + 60_000);
  expect(extendedEndAt <= predicate.endAt.lte).toBe(false);
});

function shipment(state: "CREATED" | "SHIPPED" | "ARRIVED" | "RETURNED" | "VOIDED", id = "private-shipment-id") {
  return { id, shippedAt: ["SHIPPED", "ARRIVED", "RETURNED"].includes(state) ? createdAt : null,
    arrivedAt: state === "ARRIVED" ? createdAt : null,
    returnedAt: state === "RETURNED" ? createdAt : null, voidedAt: state === "VOIDED" ? createdAt : null };
}

test.each([
  [null, null, false, null], ["CREATED", "CREATED", false, "CREATED"],
  ["SHIPPED", "SHIPPED", false, "SHIPPED"], ["ARRIVED", "ARRIVED", false, "ARRIVED"],
  ["RETURNED", null, true, "RETURNED"], ["VOIDED", null, false, "VOIDED"],
  // A later terminal history must not replace the canonical open shipment.
  ["VOIDED", "CREATED", false, "CREATED"],
  ["CREATED", "CREATED", true, "CREATED"], ["SHIPPED", "SHIPPED", true, "SHIPPED"],
  ["ARRIVED", "ARRIVED", true, "ARRIVED"], ["VOIDED", null, true, "VOIDED"],
] as const)("summary latest=%s open=%s returned=%s resolves %s and strips all private shipment data", async (latest, open, returned, expected) => {
  boundary.findMany.mockResolvedValue([row(1, { fulfillmentMethod: "SEVEN_ELEVEN", shipmentRequired: true,
    shipments: latest ? [{ ...shipment(latest), trackingNumber: "private-tracking", recipientName: "private-recipient",
      sevenElevenStoreAddress: "private-store", createdAt }] : [],
  })]);
  if (open) boundary.openShipments.mockResolvedValue([{ ...shipment(open, "private-open-id"), orderId: row(1).publicCode }]);
  if (returned) boundary.returnedOrders.mockResolvedValue([{ id: row(1).publicCode }]);
  const result = await listAdminOrders();
  expect(result).toMatchObject({ ok: true, value: { items: [{ shipmentRequired: true, shipmentState: expected,
    hasReturnedShipmentHistory: returned }] } });
  expect(JSON.stringify(result)).not.toMatch(/private-|"id"|"orderId"|"shipments"|trackingNumber|recipient|sevenElevenStore|shippedAt|arrivedAt|returnedAt|voidedAt|activeShipmentId/);
});

test.each([null, createdAt])("picked-up replacement summary stays PICKED_UP independently of paidAt=%s", async (paidAt) => {
  boundary.findMany.mockResolvedValue([row(1, { fulfillmentMethod: "SEVEN_ELEVEN", shipmentRequired: true, pickedUpAt: createdAt, paidAt })]);
  boundary.openShipments.mockResolvedValue([{ ...shipment("ARRIVED"), orderId: row(1).publicCode }]);
  boundary.returnedOrders.mockResolvedValue([{ id: row(1).publicCode }]);
  await expect(listAdminOrders()).resolves.toMatchObject({ ok: true, value: { items: [{ shipmentState: "PICKED_UP", hasReturnedShipmentHistory: true }] } });
});

test.each(["SELF_PICKUP", "SEVEN_ELEVEN"])("legacy %s and cancelled orders keep null summary and shipmentRequired=false", async (fulfillmentMethod) => {
  boundary.findMany.mockResolvedValue([row(1, { fulfillmentMethod, status: "CANCELLED", cancelledAt: createdAt })]);
  await expect(listAdminOrders()).resolves.toMatchObject({ ok: true, value: { items: [{ shipmentRequired: false, shipmentState: null, hasReturnedShipmentHistory: false }] } });
});

test("history reads are bounded to one latest row and two batches for only the displayed 50 orders", async () => {
  const pageRows = Array.from({ length: 51 }, (_, index) => row(index + 1));
  boundary.findMany.mockResolvedValue(pageRows);
  await listAdminOrders();
  expect(boundary.findMany.mock.calls[0][0].select.shipments).toEqual({
    select: { id: true, shippedAt: true, arrivedAt: true, returnedAt: true, voidedAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1,
  });
  const ids = pageRows.slice(0, 50).map((row) => row.publicCode);
  expect(boundary.openShipments).toHaveBeenCalledExactlyOnceWith({
    where: { orderId: { in: ids }, returnedAt: null, voidedAt: null },
    select: { id: true, orderId: true, shippedAt: true, arrivedAt: true, returnedAt: true, voidedAt: true }, take: 50,
  });
  expect(boundary.returnedOrders).toHaveBeenCalledExactlyOnceWith({
    where: { id: { in: ids }, shipments: { some: { returnedAt: { not: null } } } }, select: { id: true }, take: 50,
  });
});

test.each(["open", "returned"])("%s summary read failure fails the complete snapshot safely", async (stage) => {
  (stage === "open" ? boundary.openShipments : boundary.returnedOrders).mockRejectedValue(new Error("private SQL"));
  await expect(listAdminOrders()).resolves.toEqual({ ok: false, error: "FAILED" });
});

test("default query is bounded, uses stable newest-first ordering and a coherent read transaction", async () => {
  await expect(listAdminOrders()).resolves.toEqual({ ok: true, value: {
    items: rows, pageSize: 50, returnedCount: 2,
    hasOlder: false, hasNewer: false, olderCursor: null, newerCursor: null,
  } });
  expect(boundary.findMany).toHaveBeenCalledExactlyOnceWith({
    where: {}, select: expect.objectContaining(adminOrderListSelect),
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
    shipments: [],
    groupBuy: { title: "團購", id: "private-group-id", cost: 123 },
  }]);
  const result = await listAdminOrders();
  expect(result).toMatchObject({ ok: true, value: { items: [rows[0]] } });
  const serialized = JSON.stringify(result);
  expect(serialized).not.toMatch(/private-|"id"|accessToken|"cost"|shipments|tracking|"secret"/);
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
