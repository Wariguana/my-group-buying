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
  expect(result).toEqual({
    ok: true,
    value: {
      ...detailRow,
      items: [{ ...detailRow.items[0], lineSubtotal: 300 }],
    },
  });
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
