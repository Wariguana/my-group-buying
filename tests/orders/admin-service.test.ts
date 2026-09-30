// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    order: {
      findMany: boundary.findMany,
      findUnique: boundary.findUnique,
    },
  }),
}));

import {
  adminOrderDetailSelect,
  adminOrderListSelect,
  getAdminOrderByPublicCode,
  listAdminOrders,
} from "@/lib/orders/admin-service";

const publicCode = "ord-AbCdEf0123_-xyZ9";
const orderNumber = "202609140001";
const createdAt = new Date("2026-09-14T04:00:00.000Z");
const cancelledAt = new Date("2026-09-14T04:30:00.000Z");
const listRows = [
  {
    publicCode: "ord-BbCdEf0123_-xyZ9",
    orderNumber: "202609140002",
    status: "CANCELLED" as const,
    customerName: "取消顧客",
    customerPhone: "+886923456789",
    totalAmount: 450,
    createdAt,
    cancelledAt, pickedUpAt: null, paidAt: null,
    groupBuy: { title: "秋季團購" },
  },
  {
    publicCode,
    orderNumber,
    status: "PLACED" as const,
    customerName: "成立顧客",
    customerPhone: "+886912345678",
    totalAmount: 300,
    createdAt,
    cancelledAt: null, pickedUpAt: null, paidAt: null,
    groupBuy: { title: "秋季團購" },
  },
];
const detailRow = {
  publicCode,
  orderNumber,
  status: "PLACED" as const,
  fulfillmentMethod: "SELF_PICKUP" as const,
  shipmentRequired: false,
  shipments: [],
  groupBuyPickupId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  customerName: "歷史姓名",
  customerPhone: "+886912345678",
  pickupName: "歷史取貨點",
  pickupAddress: "歷史地址",
  pickupStartAt: new Date("2026-09-15T01:00:00.000Z"),
  pickupEndAt: new Date("2026-09-15T03:00:00.000Z"),
  sevenElevenStoreId: null,
  sevenElevenStoreName: null,
  sevenElevenStoreAddress: null,
  totalAmount: 300,
  createdAt,
  cancelledAt: null, pickedUpAt: null, paidAt: null,
  groupBuy: {
    title: "目前團購標題",
    startAt: new Date("2026-09-01T01:00:00.000Z"),
    endAt: new Date("2026-09-14T08:00:00.000Z"),
  },
  items: [{
    productName: "歷史商品",
    unit: "袋",
    unitPrice: 150,
    quantity: 2,
  }],
};

beforeEach(() => {
  vi.resetAllMocks();
  boundary.findMany.mockResolvedValue(listRows);
  boundary.findUnique.mockResolvedValue(detailRow);
});

test("admin list uses the explicit safe projection and deterministic newest-first ordering", async () => {
  await expect(listAdminOrders()).resolves.toEqual({ ok: true, value: listRows });
  expect(boundary.findMany).toHaveBeenCalledExactlyOnceWith({
    select: adminOrderListSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  expect(listRows.map(({ status, cancelledAt: value }) => [status, value])).toEqual([
    ["CANCELLED", cancelledAt],
    ["PLACED", null],
  ]);
});

test("admin detail validates the public code and returns historical snapshots with safe subtotals", async () => {
  const result = await getAdminOrderByPublicCode(publicCode);
  expect(boundary.findUnique).toHaveBeenCalledExactlyOnceWith({
    where: { publicCode },
    select: adminOrderDetailSelect,
  });
  expect(result).toMatchObject({
    ok: true,
    value: {
      publicCode, orderNumber, customerName: detailRow.customerName,
      pickupName: detailRow.pickupName, shipmentRequired: false,
      canMarkPickedUp: true, canAdminCancel: true, canCreateShipment: false,
      shipmentHistory: [], activeShipmentId: null,
      items: [{ ...detailRow.items[0], lineSubtotal: 300 }],
    },
  });
  if (result.ok) expect(result.value).not.toHaveProperty("groupBuyPickupId");
});

const operationNow = new Date("2026-09-28T01:00:00Z");
const sevenRow = {
  ...detailRow, fulfillmentMethod: "SEVEN_ELEVEN", shipmentRequired: true,
  groupBuyPickupId: null, pickupName: null, pickupAddress: null, pickupStartAt: null, pickupEndAt: null,
  sevenElevenStoreId: "123456", sevenElevenStoreName: "門市", sevenElevenStoreAddress: "地址",
};
const shipmentRow = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", provider: "SEVEN_ELEVEN_MYSHIP",
  trackingNumber: "TRACK-1", recipientName: "歷史收件人", recipientPhone: "0912345678",
  sevenElevenStoreId: "654321", sevenElevenStoreName: "歷史門市", sevenElevenStoreAddress: "歷史地址",
  createdAt, shippedAt: null, arrivedAt: null, returnedAt: null, voidedAt: null,
};
const shipped = { ...shipmentRow, shippedAt: createdAt };
const arrived = { ...shipped, arrivedAt: createdAt };
const returned = { ...shipped, returnedAt: createdAt };
const voided = { ...shipmentRow, voidedAt: createdAt };

test.each([
  ["before cutoff", [], { groupBuy: { ...detailRow.groupBuy, endAt: new Date(operationNow.getTime() + 1) } }, false, [], false, true],
  ["exact cutoff", [], { groupBuy: { ...detailRow.groupBuy, endAt: operationNow } }, true, [], false, true],
  ["after cutoff", [], {}, true, [], false, true],
  ["created", [shipmentRow], {}, false, ["SHIP", "VOID"], false, false],
  ["shipped", [shipped], {}, false, ["ARRIVE", "RETURN"], false, false],
  ["arrived", [arrived], {}, false, ["RETURN"], true, false],
  ["voided only", [voided], {}, true, [], false, true],
  ["returned", [returned], {}, true, [], false, false],
  ["returned replacement", [returned, { ...shipmentRow, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", trackingNumber: "TRACK-2" }], {}, false, ["SHIP", "VOID"], false, false],
  ["picked up", [arrived], { pickedUpAt: operationNow }, false, [], false, false],
  ["cancelled", [voided], { status: "CANCELLED", cancelledAt }, false, [], false, false],
] as const)("required read model matrix: %s", async (_label, shipments, patch, create, actions, pickup, cancel) => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(operationNow);
  try {
    boundary.findUnique.mockResolvedValue({ ...sevenRow, shipments, ...patch });
    const result = await getAdminOrderByPublicCode(publicCode);
    expect(result).toMatchObject({ ok: true, value: {
      canCreateShipment: create, allowedShipmentActions: actions, canMarkPickedUp: pickup, canAdminCancel: cancel,
    } });
    if (result.ok) {
      expect(result.value.shipmentHistory).toHaveLength(shipments.length);
      for (const entry of result.value.shipmentHistory) {
        expect(entry).not.toHaveProperty("id"); expect(entry).not.toHaveProperty("orderId"); expect(entry).not.toHaveProperty("updatedAt");
      }
      if (_label === "picked up") {
        expect(result.value.shipmentHistory[0].state).toBe("PICKED_UP");
        expect(result.value.activeShipmentId).toBeNull();
      }
    }
  } finally { vi.useRealTimers(); }
});

test.each([false, true])("paid=%s does not gate required creation/pickup/transitions", async (paid) => {
  const paidAt = paid ? createdAt : null;
  boundary.findUnique.mockResolvedValue({ ...sevenRow, paidAt });
  await expect(getAdminOrderByPublicCode(publicCode)).resolves.toMatchObject({ ok: true, value: { canCreateShipment: true, canAdminCancel: !paid } });
  boundary.findUnique.mockResolvedValue({ ...sevenRow, paidAt, shipments: [arrived] });
  await expect(getAdminOrderByPublicCode(publicCode)).resolves.toMatchObject({ ok: true, value: { canMarkPickedUp: true, allowedShipmentActions: ["RETURN"] } });
});

test("legacy false retains operations and needs no Shipment even after pickup", async () => {
  boundary.findUnique.mockResolvedValue({ ...sevenRow, shipmentRequired: false });
  await expect(getAdminOrderByPublicCode(publicCode)).resolves.toMatchObject({ ok: true, value: { canCreateShipment: false, canMarkPickedUp: true, canAdminCancel: true } });
  boundary.findUnique.mockResolvedValue({ ...sevenRow, shipmentRequired: false, pickedUpAt: operationNow });
  await expect(getAdminOrderByPublicCode(publicCode)).resolves.toMatchObject({ ok: true, value: { shipmentHistory: [], canMarkPickedUp: false } });
});

test("terminal snapshots and states survive replacement pickup; ordered select hides internals", async () => {
  boundary.findUnique.mockResolvedValue({ ...sevenRow, pickedUpAt: operationNow, shipments: [voided,
    { ...returned, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", trackingNumber: "RETURNED" },
    { ...arrived, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", trackingNumber: "REPLACEMENT" }] });
  const result = await getAdminOrderByPublicCode(publicCode);
  expect(adminOrderDetailSelect.shipments.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
  expect(result.ok && result.value.shipmentHistory.map((row) => row.state)).toEqual(["VOIDED", "RETURNED", "PICKED_UP"]);
  if (result.ok) expect(result.value.shipmentHistory[0]).toMatchObject({ recipientName: "歷史收件人", sevenElevenStoreName: "歷史門市" });
  expect(JSON.stringify(adminOrderListSelect)).not.toMatch(/shipment|tracking|recipient|accessToken/i);
});

test("cutoff extension blocks replacement but not current transitions or cancellation policy", async () => {
  const groupBuy = { ...detailRow.groupBuy, endAt: new Date("2099-01-01T00:00:00Z") };
  boundary.findUnique.mockResolvedValue({ ...sevenRow, groupBuy, shipments: [shipped] });
  await expect(getAdminOrderByPublicCode(publicCode)).resolves.toMatchObject({ ok: true, value: { allowedShipmentActions: ["ARRIVE", "RETURN"], canAdminCancel: false } });
  boundary.findUnique.mockResolvedValue({ ...sevenRow, groupBuy, shipments: [returned] });
  await expect(getAdminOrderByPublicCode(publicCode)).resolves.toMatchObject({ ok: true, value: { canCreateShipment: false, shipmentCreationBlockReason: "BEFORE_CUTOFF", canAdminCancel: false } });
});

test.each([
  ["required self", { ...detailRow, shipmentRequired: true }],
  ["two active", { ...sevenRow, shipments: [shipmentRow, { ...shipmentRow, id: "other" }] }],
  ["arrived without ship", { ...sevenRow, shipments: [{ ...shipmentRow, arrivedAt: createdAt }] }],
  ["backward arrival", { ...sevenRow, shipments: [{ ...shipped, arrivedAt: new Date(0) }] }],
  ["return without ship", { ...sevenRow, shipments: [{ ...shipmentRow, returnedAt: createdAt }] }],
  ["return before arrival", { ...sevenRow, shipments: [{ ...arrived, returnedAt: new Date(0) }] }],
  ["void after ship", { ...sevenRow, shipments: [{ ...shipped, voidedAt: createdAt }] }],
  ["both terminals", { ...sevenRow, shipments: [{ ...returned, voidedAt: createdAt }] }],
  ["wrong provider", { ...sevenRow, shipments: [{ ...shipmentRow, provider: "OTHER" }] }],
  ["blank tracking", { ...sevenRow, shipments: [{ ...shipmentRow, trackingNumber: "\t" }] }],
  ["blank snapshot", { ...sevenRow, shipments: [{ ...shipmentRow, recipientName: " " }] }],
  ["invalid date", { ...sevenRow, shipments: [{ ...shipped, shippedAt: new Date("bad") }] }],
  ["ship before creation", { ...sevenRow, shipments: [{ ...shipped, shippedAt: new Date(0) }] }],
  ["void before creation", { ...sevenRow, shipments: [{ ...voided, voidedAt: new Date(0) }] }],
  ["pickup timestamp before arrival", { ...sevenRow, pickedUpAt: new Date(0), shipments: [arrived] }],
  ["pickup no active", { ...sevenRow, pickedUpAt: operationNow }],
  ["pickup only terminals", { ...sevenRow, pickedUpAt: operationNow, shipments: [voided, returned] }],
  ["pickup before arrival", { ...sevenRow, pickedUpAt: operationNow, shipments: [shipped] }],
  ["cancelled active", { ...sevenRow, status: "CANCELLED", cancelledAt, shipments: [shipmentRow] }],
  ["cancelled returned", { ...sevenRow, status: "CANCELLED", cancelledAt, shipments: [returned] }],
  ["void recorded after cancellation", { ...sevenRow, status: "CANCELLED", cancelledAt, shipments: [{ ...voided, voidedAt: operationNow }] }],
] as const)("inconsistent required projection fails closed: %s", async (_label, row) => {
  boundary.findUnique.mockResolvedValue(row);
  await expect(getAdminOrderByPublicCode(publicCode)).resolves.toEqual({ ok: false, error: "FAILED" });
});

test("invalid public codes fail as not found without querying the database", async () => {
  await expect(getAdminOrderByPublicCode("invalid")).resolves.toEqual({
    ok: false,
    error: "NOT_FOUND",
  });
  expect(boundary.findUnique).not.toHaveBeenCalled();
});

test("missing orders fail as not found", async () => {
  boundary.findUnique.mockResolvedValue(null);
  await expect(getAdminOrderByPublicCode(publicCode)).resolves.toEqual({
    ok: false,
    error: "NOT_FOUND",
  });
});

test.each([
  ["unsafe subtotal", { items: [{ ...detailRow.items[0], unitPrice: Number.MAX_SAFE_INTEGER }] }],
  ["invalid quantity", { items: [{ ...detailRow.items[0], quantity: 0 }] }],
  ["invalid total", { totalAmount: -1 }],
  ["invalid order number", { orderNumber: "bad" }],
  ["cancelled without timestamp", { status: "CANCELLED", cancelledAt: null }],
])("corrupt detail fails closed: %s", async (_label, patch) => {
  boundary.findUnique.mockResolvedValue({ ...detailRow, ...patch });
  await expect(getAdminOrderByPublicCode(publicCode)).resolves.toEqual({
    ok: false,
    error: "FAILED",
  });
});

test("admin reads do not require a management token and never return its hash", async () => {
  const [list, detail] = await Promise.all([
    listAdminOrders(),
    getAdminOrderByPublicCode(publicCode),
  ]);
  expect(JSON.stringify({ list, detail, adminOrderListSelect, adminOrderDetailSelect }))
    .not.toContain("accessTokenHash");
});

test("Admin detail returns the method-specific 7-ELEVEN snapshots", async () => {
  boundary.findUnique.mockResolvedValue({
    ...detailRow,
    fulfillmentMethod: "SEVEN_ELEVEN",
    groupBuyPickupId: null,
    pickupName: null,
    pickupAddress: null,
    pickupStartAt: null,
    pickupEndAt: null,
    sevenElevenStoreId: "123456",
    sevenElevenStoreName: "權威門市",
    sevenElevenStoreAddress: "臺北市權威路 1 號",
  });
  await expect(getAdminOrderByPublicCode(publicCode)).resolves.toMatchObject({ ok: true, value: {
    fulfillmentMethod: "SEVEN_ELEVEN",
    sevenElevenStoreId: "123456",
    sevenElevenStoreName: "權威門市",
    sevenElevenStoreAddress: "臺北市權威路 1 號",
  } });
});

test("database failures are sanitized", async () => {
  boundary.findMany.mockRejectedValue(new Error("private list error"));
  boundary.findUnique.mockRejectedValue(new Error("private detail error"));
  await expect(listAdminOrders()).resolves.toEqual({ ok: false, error: "FAILED" });
  await expect(getAdminOrderByPublicCode(publicCode)).resolves.toEqual({
    ok: false,
    error: "FAILED",
  });
});


test("pickup projected safely in list and detail", async () => {
 const pickedUpAt = new Date();
 boundary.findMany.mockResolvedValue([{ ...listRows[1], pickedUpAt }]);
 boundary.findUnique.mockResolvedValue({ ...detailRow, pickedUpAt });
 await expect(listAdminOrders()).resolves.toMatchObject({ ok: true, value: [{ pickedUpAt }] });
 await expect(getAdminOrderByPublicCode(publicCode)).resolves.toMatchObject({ ok: true, value: { pickedUpAt } });
});
test("corrupt cancelled pickup fails closed in list and detail", async () => {
 const corrupt = { ...detailRow, status: "CANCELLED", cancelledAt, pickedUpAt: createdAt };
 boundary.findMany.mockResolvedValue([corrupt]); boundary.findUnique.mockResolvedValue(corrupt);
 await expect(listAdminOrders()).resolves.toEqual({ ok: false, error: "FAILED" });
 await expect(getAdminOrderByPublicCode(publicCode)).resolves.toEqual({ ok: false, error: "FAILED" });
});

test("paidAt is projected in Admin list and detail", async () => {
  const paidAt = new Date("2026-09-15T02:00:00Z");
  boundary.findMany.mockResolvedValue([{ ...listRows[1], paidAt }]);
  boundary.findUnique.mockResolvedValue({ ...detailRow, paidAt });
  await expect(listAdminOrders()).resolves.toMatchObject({ ok: true, value: [{ paidAt }] });
  await expect(getAdminOrderByPublicCode(publicCode)).resolves.toMatchObject({ ok: true, value: { paidAt } });
});
test("corrupt cancelled payment fails closed in Admin list and detail", async () => {
  const corrupt = { ...detailRow, status: "CANCELLED", cancelledAt, paidAt: createdAt };
  boundary.findMany.mockResolvedValue([corrupt]);
  boundary.findUnique.mockResolvedValue(corrupt);
  await expect(listAdminOrders()).resolves.toEqual({ ok: false, error: "FAILED" });
  await expect(getAdminOrderByPublicCode(publicCode)).resolves.toEqual({ ok: false, error: "FAILED" });
});
