// @vitest-environment node

import { afterAll, beforeEach, expect, test, vi } from "vitest";

const tx = vi.hoisted(() => ({
  order: { findFirst: vi.fn(), updateMany: vi.fn() },
  groupBuyItem: { updateMany: vi.fn() },
}));
const db = vi.hoisted(() => ({ $transaction: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));

import { Prisma } from "@/generated/prisma/client";
import { hashOrderAccessToken } from "@/lib/orders/access-token";
import { cancelOrder } from "@/lib/orders/cancel-service";

const now = new Date("2026-09-14T04:00:00.000Z");
const publicCode = "ord-AbCdEf0123_-xyZ9";
const token = "A".repeat(43);
const itemAId = "22222222-2222-4222-8222-aaaaaaaaaaaa";
const itemBId = "22222222-2222-4222-8222-bbbbbbbbbbbb";

function placedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-id",
    publicCode,
    status: "PLACED",
    cancelledAt: null,
    groupBuy: { endAt: new Date(now.getTime() + 1) },
    items: [
      { groupBuyItemId: itemBId, quantity: 3, groupBuyItem: { stock: null } },
      { groupBuyItemId: itemAId, quantity: 2, groupBuyItem: { stock: 4 } },
    ],
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
  tx.order.findFirst.mockResolvedValue(placedOrder());
  tx.order.updateMany.mockResolvedValue({ count: 1 });
  tx.groupBuyItem.updateMany.mockResolvedValue({ count: 1 });
});

afterAll(() => vi.useRealTimers());

test.each([
  ["malformed publicCode", "bad", token, false],
  ["missing token", publicCode, undefined, false],
  ["malformed token", publicCode, "bad", false],
  ["missing Order", publicCode, token, true],
  ["wrong token", publicCode, "B".repeat(43), true],
  ["cross-order token", publicCode, "C".repeat(43), true],
  ["legacy null hash", publicCode, token, true],
] as const)("%s is ACCESS_DENIED without mutation", async (_label, code, raw, queries) => {
  if (queries) tx.order.findFirst.mockResolvedValue(null);
  await expectCode(cancelOrder(code, raw), "ACCESS_DENIED");
  expect(tx.order.updateMany).not.toHaveBeenCalled();
  expect(tx.groupBuyItem.updateMany).not.toHaveBeenCalled();
  expect(db.$transaction).toHaveBeenCalledTimes(queries ? 1 : 0);
});

test("authorized PLACED order before cutoff claims once and restores only finite stock", async () => {
  const result = await cancelOrder(publicCode, token);
  const accessTokenHash = hashOrderAccessToken(token);
  expect(tx.order.findFirst).toHaveBeenCalledWith({
    where: { publicCode, accessTokenHash },
    select: expect.any(Object),
  });
  expect(tx.order.updateMany).toHaveBeenCalledExactlyOnceWith({
    where: { id: "order-id", accessTokenHash, status: "PLACED" },
    data: { status: "CANCELLED", cancelledAt: now },
  });
  expect(tx.groupBuyItem.updateMany).toHaveBeenCalledExactlyOnceWith({
    where: { id: itemAId, stock: { not: null } },
    data: { stock: { increment: 2 } },
  });
  expect(result).toEqual({ publicCode, status: "CANCELLED", cancelledAt: now });
  expect(Object.keys(result).sort()).toEqual(["cancelledAt", "publicCode", "status"]);
  expect(db.$transaction.mock.calls[0][1]).toEqual({
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
});

test.each([
  ["exact cutoff", now],
  ["after cutoff", new Date(now.getTime() - 1)],
])("%s is closed before claim", async (_label, endAt) => {
  tx.order.findFirst.mockResolvedValue(placedOrder({ groupBuy: { endAt } }));
  await expectCode(cancelOrder(publicCode, token), "CANCELLATION_CLOSED");
  expect(tx.order.updateMany).not.toHaveBeenCalled();
  expect(tx.groupBuyItem.updateMany).not.toHaveBeenCalled();
});

test("already CANCELLED is idempotent even after cutoff", async () => {
  const storedCancelledAt = new Date("2026-09-13T03:00:00.000Z");
  tx.order.findFirst.mockResolvedValue(placedOrder({
    status: "CANCELLED",
    cancelledAt: storedCancelledAt,
    groupBuy: { endAt: new Date(now.getTime() - 10_000) },
  }));
  await expect(cancelOrder(publicCode, token)).resolves.toEqual({
    publicCode,
    status: "CANCELLED",
    cancelledAt: storedCancelledAt,
  });
  expect(tx.order.updateMany).not.toHaveBeenCalled();
  expect(tx.groupBuyItem.updateMany).not.toHaveBeenCalled();
});

test("already-CANCELLED idempotency requires exact token authorization first", async () => {
  const storedCancelledAt = new Date("2026-09-13T03:00:00.000Z");
  const authorizedCancelledOrder = placedOrder({
    status: "CANCELLED",
    cancelledAt: storedCancelledAt,
  });
  const correctAccessTokenHash = hashOrderAccessToken(token);
  tx.order.findFirst.mockImplementation(async ({ where }) =>
    where.publicCode === publicCode
      && where.accessTokenHash === correctAccessTokenHash
      ? authorizedCancelledOrder
      : null);

  const wrongToken = "B".repeat(43);
  await expectCode(cancelOrder(publicCode, wrongToken), "ACCESS_DENIED");

  expect(tx.order.findFirst).toHaveBeenCalledExactlyOnceWith({
    where: {
      publicCode,
      accessTokenHash: hashOrderAccessToken(wrongToken),
    },
    select: expect.any(Object),
  });
  expect(tx.order.updateMany).not.toHaveBeenCalled();
  expect(tx.groupBuyItem.updateMany).not.toHaveBeenCalled();
});

test("CANCELLED with null cancelledAt fails closed without mutation", async () => {
  tx.order.findFirst.mockResolvedValue(placedOrder({ status: "CANCELLED", cancelledAt: null }));
  await expectCode(cancelOrder(publicCode, token), "FAILED");
  expect(tx.order.updateMany).not.toHaveBeenCalled();
});

test("restores finite items in canonical groupBuyItemId order", async () => {
  tx.order.findFirst.mockResolvedValue(placedOrder({ items: [
    { groupBuyItemId: itemBId.toUpperCase(), quantity: 3, groupBuyItem: { stock: 1 } },
    { groupBuyItemId: itemAId.toUpperCase(), quantity: 2, groupBuyItem: { stock: 1 } },
  ] }));
  await cancelOrder(publicCode, token);
  expect(tx.groupBuyItem.updateMany.mock.calls.map(([query]) => query.where.id)).toEqual([
    itemAId.toUpperCase(),
    itemBId.toUpperCase(),
  ]);
});

test("restoration failure is sanitized and the transaction owns rollback", async () => {
  tx.order.findFirst.mockResolvedValue(placedOrder({ items: [
    { groupBuyItemId: itemAId, quantity: 2, groupBuyItem: { stock: 1 } },
    { groupBuyItemId: itemBId, quantity: 3, groupBuyItem: { stock: 1 } },
  ] }));
  tx.groupBuyItem.updateMany
    .mockResolvedValueOnce({ count: 1 })
    .mockRejectedValueOnce(new Error("private database failure"));
  const result = await cancelOrder(publicCode, token).catch((error: unknown) => error);
  expect(result).toMatchObject({ code: "FAILED", message: "The cancellation failed." });
  expect(tx.order.updateMany).toHaveBeenCalledTimes(1);
  expect(tx.groupBuyItem.updateMany).toHaveBeenCalledTimes(2);
});

test("whole-transaction retry takes a fresh server now and closes at the crossed cutoff", async () => {
  const endAt = new Date(now.getTime() + 1);
  tx.order.findFirst.mockResolvedValue(placedOrder({ groupBuy: { endAt } }));
  let attempt = 0;
  db.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => {
    attempt += 1;
    const result = await callback(tx);
    if (attempt === 1) {
      vi.setSystemTime(new Date(now.getTime() + 2));
      throw new Prisma.PrismaClientKnownRequestError("serialization", {
        code: "P2034",
        clientVersion: "7.10.0",
      });
    }
    return result;
  });

  await expectCode(cancelOrder(publicCode, token), "CANCELLATION_CLOSED");
  expect(db.$transaction).toHaveBeenCalledTimes(2);
  expect(tx.order.findFirst).toHaveBeenCalledTimes(2);
  expect(tx.order.updateMany).toHaveBeenCalledTimes(1);
  expect(tx.groupBuyItem.updateMany).toHaveBeenCalledTimes(1);
});

test("does not gate historical reversal on current master-data activity", async () => {
  const selected = tx.order.findFirst.mockResolvedValue(placedOrder());
  await cancelOrder(publicCode, token);
  expect(JSON.stringify(selected.mock.calls[0][0].select)).not.toMatch(/isActive|product|pickupLocation/);
});
