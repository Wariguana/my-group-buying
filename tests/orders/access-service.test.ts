// @vitest-environment node

import { afterEach, beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  getDb: () => ({ order: { findFirst: boundary.findFirst } }),
}));

import { hashOrderAccessToken } from "@/lib/orders/access-token";
import {
  getOrderForAccess,
  ORDER_ACCESS_FAILURE_MESSAGE,
} from "@/lib/orders/access-service";

const publicCode = "ord-AbCdEf0123_-xyZ9";
const orderNumber = "202609140001";
const token = "A".repeat(43);
const safeOrder = {
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
  createdAt: new Date("2026-09-14T04:00:00.000Z"),
  cancelledAt: null, pickedUpAt: null, paidAt: null,
  groupBuy: { endAt: new Date("2099-09-14T04:00:00.000Z") },
  items: [{
    productName: "歷史商品",
    unit: "袋",
    unitPrice: 150,
    quantity: 2,
  }],
};

beforeEach(() => {
  vi.resetAllMocks();
  boundary.findFirst.mockResolvedValue(safeOrder);
});

afterEach(() => vi.useRealTimers());

test("matching publicCode and token return only the historical customer projection", async () => {
  const result = await getOrderForAccess(publicCode, token);

  expect(boundary.findFirst).toHaveBeenCalledWith({
    where: { publicCode, accessTokenHash: hashOrderAccessToken(token) },
    select: expect.objectContaining({
      publicCode: true,
      orderNumber: true,
      customerName: true,
      items: expect.any(Object),
    }),
  });
  expect(result).toEqual({
    ok: true,
    value: {
      publicCode: safeOrder.publicCode,
      orderNumber: safeOrder.orderNumber,
      status: safeOrder.status,
      fulfillmentMethod: safeOrder.fulfillmentMethod,
      customerName: safeOrder.customerName,
      customerPhone: safeOrder.customerPhone,
      pickupName: safeOrder.pickupName,
      pickupAddress: safeOrder.pickupAddress,
      pickupStartAt: safeOrder.pickupStartAt,
      pickupEndAt: safeOrder.pickupEndAt,
      sevenElevenStoreId: null,
      sevenElevenStoreName: null,
      sevenElevenStoreAddress: null,
      totalAmount: safeOrder.totalAmount,
      createdAt: safeOrder.createdAt,
      cancelledAt: safeOrder.cancelledAt,
      pickedUpAt: null, paidAt: null,
      canCancel: true,
      cancellationDeadline: safeOrder.groupBuy.endAt,
      items: [{ ...safeOrder.items[0], lineSubtotal: 300 }],
    },
  });
  const serialized = JSON.stringify(result);
  for (const forbidden of [
    "accessTokenHash",
    '"id"',
    "customerId",
    "groupBuyId",
    "groupBuyPickupId",
    "groupBuyItemId",
    "cost",
    "supplier",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
});

const eligibilityNow = new Date("2026-09-14T04:00:00.000Z");

test.each([
  ["before cutoff", "PLACED", new Date(eligibilityNow.getTime() + 1), true],
  ["exact cutoff", "PLACED", eligibilityNow, false],
  ["past cutoff", "PLACED", new Date(eligibilityNow.getTime() - 1), false],
  ["cancelled", "CANCELLED", new Date(eligibilityNow.getTime() + 1), false],
] as const)("derives cancellation eligibility for %s", async (_label, status, endAt, canCancel) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(eligibilityNow);
  boundary.findFirst.mockResolvedValue({
    ...safeOrder,
    status,
    cancelledAt: status === "CANCELLED" ? new Date("2026-09-14T04:00:00.000Z") : null,
    groupBuy: { endAt },
  });
  const result = await getOrderForAccess(publicCode, token);
  expect(result).toMatchObject({ ok: true, value: { canCancel, cancellationDeadline: endAt } });
});

test("corrupt CANCELLED detail without cancelledAt fails closed", async () => {
  boundary.findFirst.mockResolvedValue({
    ...safeOrder,
    status: "CANCELLED",
    cancelledAt: null, pickedUpAt: null, paidAt: null,
  });
  await expect(getOrderForAccess(publicCode, token)).resolves.toEqual({
    ok: false,
    message: ORDER_ACCESS_FAILURE_MESSAGE,
  });
});

test("corrupt human-readable order number fails closed", async () => {
  boundary.findFirst.mockResolvedValue({ ...safeOrder, orderNumber: "bad" });
  await expect(getOrderForAccess(publicCode, token)).resolves.toEqual({
    ok: false,
    message: ORDER_ACCESS_FAILURE_MESSAGE,
  });
});

test.each([
  ["invalid publicCode", "bad", token, false],
  ["invalid token format", publicCode, "bad", false],
  ["missing Order", publicCode, token, true],
  ["null accessTokenHash historical Order", publicCode, token, true],
  ["wrong token", publicCode, "B".repeat(43), true],
  ["token belonging to another Order", publicCode, "C".repeat(43), true],
] as const)("%s returns the same generic access failure", async (_label, code, raw, queries) => {
  if (queries) boundary.findFirst.mockResolvedValue(null);
  const result = await getOrderForAccess(code, raw);
  expect(result).toEqual({ ok: false, message: ORDER_ACCESS_FAILURE_MESSAGE });
  expect(boundary.findFirst).toHaveBeenCalledTimes(queries ? 1 : 0);
});

test("database errors are sanitized to the same generic access failure", async () => {
  boundary.findFirst.mockRejectedValue(new Error("private database detail"));
  await expect(getOrderForAccess(publicCode, token)).resolves.toEqual({
    ok: false,
    message: ORDER_ACCESS_FAILURE_MESSAGE,
  });
});

test("customer projection returns only 7-ELEVEN method snapshots", async () => {
  boundary.findFirst.mockResolvedValue({
    ...safeOrder,
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
  await expect(getOrderForAccess(publicCode, token)).resolves.toMatchObject({ ok: true, value: {
    fulfillmentMethod: "SEVEN_ELEVEN",
    pickupName: null,
    sevenElevenStoreId: "123456",
    sevenElevenStoreName: "權威門市",
    sevenElevenStoreAddress: "臺北市權威路 1 號",
  } });
});


test("authorized pickup safely projected and blocks cancellation", async () => {
 const pickedUpAt = new Date();
 boundary.findFirst.mockResolvedValue({ ...safeOrder, pickedUpAt });
 await expect(getOrderForAccess(publicCode, token)).resolves.toMatchObject({ ok: true, value: { pickedUpAt, canCancel: false } });
});
test("corrupt cancelled pickup fails closed", async () => {
 boundary.findFirst.mockResolvedValue({ ...safeOrder, status: "CANCELLED", cancelledAt: new Date(), pickedUpAt: new Date() });
 await expect(getOrderForAccess(publicCode, token)).resolves.toEqual({ ok: false, message: ORDER_ACCESS_FAILURE_MESSAGE });
});

test("paidAt is projected and disables cancellation before cutoff", async () => {
  const paidAt = new Date("2026-09-15T02:00:00Z");
  boundary.findFirst.mockResolvedValue({ ...safeOrder, paidAt });
  await expect(getOrderForAccess(publicCode, token)).resolves.toMatchObject({ ok: true, value: { paidAt, canCancel: false } });
});
test("corrupt cancelled payment fails closed", async () => {
  boundary.findFirst.mockResolvedValue({ ...safeOrder, status: "CANCELLED", cancelledAt: new Date(), paidAt: new Date() });
  await expect(getOrderForAccess(publicCode, token)).resolves.toEqual({ ok: false, message: ORDER_ACCESS_FAILURE_MESSAGE });
});
