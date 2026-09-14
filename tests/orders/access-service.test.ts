// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

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
const token = "A".repeat(43);
const safeOrder = {
  publicCode,
  status: "PLACED" as const,
  customerName: "歷史姓名",
  customerPhone: "+886912345678",
  pickupName: "歷史取貨點",
  pickupAddress: "歷史地址",
  pickupStartAt: new Date("2026-09-15T01:00:00.000Z"),
  pickupEndAt: new Date("2026-09-15T03:00:00.000Z"),
  totalAmount: 300,
  createdAt: new Date("2026-09-14T04:00:00.000Z"),
  cancelledAt: null,
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

test("matching publicCode and token return only the historical customer projection", async () => {
  const result = await getOrderForAccess(publicCode, token);

  expect(boundary.findFirst).toHaveBeenCalledWith({
    where: { publicCode, accessTokenHash: hashOrderAccessToken(token) },
    select: expect.objectContaining({
      publicCode: true,
      customerName: true,
      items: expect.any(Object),
    }),
  });
  expect(result).toEqual({
    ok: true,
    value: {
      ...safeOrder,
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
