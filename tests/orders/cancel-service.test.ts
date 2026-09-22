// @vitest-environment node

import { afterAll, beforeEach, expect, test, vi } from "vitest";

const tx = vi.hoisted(() => ({
  order: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  groupBuyItem: { updateMany: vi.fn() },
}));
const db = vi.hoisted(() => ({ $transaction: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));

import { Prisma } from "@/generated/prisma/client";
import { hashOrderAccessToken } from "@/lib/orders/access-token";
import {
  cancelOrder as cancelOrderWithCredentials,
  cancelOrderAsAdmin,
} from "@/lib/orders/cancel-service";

const now = new Date("2026-09-14T04:00:00.000Z");
const publicCode = "ord-AbCdEf0123_-xyZ9";
const token = "A".repeat(43);
const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const itemAId = "22222222-2222-4222-8222-aaaaaaaaaaaa";
const itemBId = "22222222-2222-4222-8222-bbbbbbbbbbbb";

function placedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-id",
    publicCode,
    status: "PLACED",
    cancelledAt: null, pickedUpAt: null, paidAt: null,
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

function cancelOrder(publicCodeValue: unknown, accessToken: unknown) {
  return cancelOrderWithCredentials(publicCodeValue, { accessToken: accessToken as string | undefined });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  tx.order.findFirst.mockResolvedValue(placedOrder());
  tx.order.findUnique.mockResolvedValue(placedOrder());
  tx.order.updateMany.mockResolvedValue({ count: 1 });
  tx.groupBuyItem.updateMany.mockResolvedValue({ count: 1 });
});

afterAll(() => vi.useRealTimers());

test.each(["customer", "admin"])("%s picked up rejects before cutoff checks or writes", async (actor) => {
  const order = placedOrder({ pickedUpAt: now, groupBuy: { endAt: new Date(0) } });
  tx.order.findFirst.mockResolvedValue(order);
  tx.order.findUnique.mockResolvedValue(order);
  await expectCode(actor === "admin" ? cancelOrderAsAdmin(publicCode) : cancelOrder(publicCode, token), "ALREADY_PICKED_UP");
  expect(tx.order.updateMany).not.toHaveBeenCalled();
  expect(tx.groupBuyItem.updateMany).not.toHaveBeenCalled();
});

test.each(["customer", "admin"])("%s corrupt cancelled pickup fails closed", async (actor) => {
  const order = placedOrder({ status: "CANCELLED", cancelledAt: now, pickedUpAt: now });
  tx.order.findFirst.mockResolvedValue(order);
  tx.order.findUnique.mockResolvedValue(order);
  await expectCode(actor === "admin" ? cancelOrderAsAdmin(publicCode) : cancelOrder(publicCode, token), "FAILED");
  expect(tx.groupBuyItem.updateMany).not.toHaveBeenCalled();
});

test.each(["customer", "admin"])("%s losing cancellation rereads pickup and does not restore stock", async (actor) => {
  const reader = actor === "admin" ? tx.order.findUnique : tx.order.findFirst;
  reader.mockResolvedValueOnce(placedOrder()).mockResolvedValueOnce(placedOrder({ pickedUpAt: now }));
  tx.order.updateMany.mockResolvedValueOnce({ count: 0 });
  await expectCode(actor === "admin" ? cancelOrderAsAdmin(publicCode) : cancelOrder(publicCode, token), "ALREADY_PICKED_UP");
  expect(reader).toHaveBeenCalledTimes(2);
  expect(tx.groupBuyItem.updateMany).not.toHaveBeenCalled();
});

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
    where: { id: "order-id", accessTokenHash, status: "PLACED", pickedUpAt: null, paidAt: null },
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

test("authenticated owner can cancel without a legacy token and ownership scopes the claim", async () => {
  const result = await cancelOrderWithCredentials(publicCode, { customerAccountId: accountId });
  expect(tx.order.findFirst).toHaveBeenCalledWith({
    where: { publicCode, customerAccountId: accountId },
    select: expect.any(Object),
  });
  expect(tx.order.updateMany).toHaveBeenCalledExactlyOnceWith({
    where: {
      id: "order-id",
      customerAccountId: accountId,
      status: "PLACED",
      pickedUpAt: null,
      paidAt: null,
    },
    data: { status: "CANCELLED", cancelledAt: now },
  });
  expect(result).toEqual({ publicCode, status: "CANCELLED", cancelledAt: now });
});

test("wrong authenticated account cannot cancel or restore stock", async () => {
  tx.order.findFirst.mockResolvedValue(null);
  await expectCode(cancelOrderWithCredentials(publicCode, {
    customerAccountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  }), "ACCESS_DENIED");
  expect(tx.order.updateMany).not.toHaveBeenCalled();
  expect(tx.groupBuyItem.updateMany).not.toHaveBeenCalled();
});

test("token or authenticated ownership can independently authorize cancellation", async () => {
  await cancelOrderWithCredentials(publicCode, { accessToken: token, customerAccountId: accountId });
  const tokenHash = hashOrderAccessToken(token);
  expect(tx.order.findFirst).toHaveBeenCalledWith({
    where: { publicCode, OR: [{ accessTokenHash: tokenHash }, { customerAccountId: accountId }] },
    select: expect.any(Object),
  });
  expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      OR: [{ accessTokenHash: tokenHash }, { customerAccountId: accountId }],
    }),
  }));
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

test.each([-1, 0, 1])("Admin ignores cutoff offset %s and uses no customer token", async (offset) => {
  const row = placedOrder({ groupBuy: { endAt: new Date(now.getTime() + offset) } });
  tx.order.findUnique.mockResolvedValue(row);
  await expect(cancelOrderAsAdmin(publicCode)).resolves.toEqual({ publicCode, status: "CANCELLED", cancelledAt: now });
  expect(tx.order.findFirst).not.toHaveBeenCalled();
  expect(tx.order.findUnique).toHaveBeenCalledWith({ where: { publicCode }, select: expect.any(Object) });
  expect(JSON.stringify(tx.order.findUnique.mock.calls[0][0])).not.toMatch(/accessToken|endAt|groupBuy"/);
  expect(tx.order.updateMany).toHaveBeenCalledExactlyOnceWith({
    where: { id: "order-id", status: "PLACED", pickedUpAt: null, paidAt: null },
    data: { status: "CANCELLED", cancelledAt: now },
  });
  expect(tx.groupBuyItem.updateMany).toHaveBeenCalledExactlyOnceWith({
    where: { id: itemAId, stock: { not: null } }, data: { stock: { increment: 2 } },
  });
  expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
});

test("Admin never evaluates a customer cutoff or management token", async () => {
  const row = placedOrder();
  Object.defineProperty(row, "groupBuy", { get() { throw new Error("customer cutoff read"); } });
  Object.defineProperty(row, "accessTokenHash", { get() { throw new Error("customer token read"); } });
  tx.order.findUnique.mockResolvedValue(row);
  await expect(cancelOrderAsAdmin(publicCode)).resolves.toMatchObject({ status: "CANCELLED" });
});

test.each([null, undefined, "bad", `${publicCode} `])("invalid Admin code %s never opens a transaction", async (code) => {
  await expectCode(cancelOrderAsAdmin(code), "ACCESS_DENIED");
  expect(db.$transaction).not.toHaveBeenCalled();
});

test("Admin missing order fails without mutation", async () => {
  tx.order.findUnique.mockResolvedValue(null);
  await expectCode(cancelOrderAsAdmin(publicCode), "ACCESS_DENIED");
  expect(tx.order.updateMany).not.toHaveBeenCalled();
});

test("Admin already-cancelled result preserves stored time without writes", async () => {
  const stored = new Date(now.getTime() - 10_000);
  tx.order.findUnique.mockResolvedValue(placedOrder({ status: "CANCELLED", cancelledAt: stored }));
  await expect(cancelOrderAsAdmin(publicCode)).resolves.toEqual({ publicCode, status: "CANCELLED", cancelledAt: stored });
  expect(tx.order.updateMany).not.toHaveBeenCalled();
  expect(tx.groupBuyItem.updateMany).not.toHaveBeenCalled();
});

test("Admin corrupt cancelled timestamp fails closed", async () => {
  tx.order.findUnique.mockResolvedValue(placedOrder({ status: "CANCELLED", cancelledAt: null }));
  await expectCode(cancelOrderAsAdmin(publicCode), "FAILED");
  expect(tx.order.updateMany).not.toHaveBeenCalled();
});

test("Admin lost claim retries the whole read and returns the winner without restoring", async () => {
  const stored = new Date(now.getTime() - 1);
  tx.order.updateMany.mockResolvedValueOnce({ count: 0 });
  tx.order.findUnique.mockResolvedValueOnce(placedOrder())
    .mockResolvedValueOnce(placedOrder({ status: "CANCELLED", cancelledAt: stored }));
  await expect(cancelOrderAsAdmin(publicCode)).resolves.toEqual({ publicCode, status: "CANCELLED", cancelledAt: stored });
  expect(db.$transaction).toHaveBeenCalledTimes(2);
  expect(tx.order.findUnique).toHaveBeenCalledTimes(2);
  expect(tx.order.updateMany).toHaveBeenCalledTimes(1);
  expect(tx.groupBuyItem.updateMany).not.toHaveBeenCalled();
});

test("Admin retry uses a fresh time, but one time throughout each attempt", async () => {
  const retryNow = new Date(now.getTime() + 5_000);
  let attempts = 0;
  db.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => {
    attempts += 1;
    // Change the clock after the attempt's timestamp was captured.
    vi.setSystemTime(new Date(now.getTime() + 1_000));
    const result = await callback(tx);
    if (attempts === 1) {
      vi.setSystemTime(retryNow);
      throw new Prisma.PrismaClientKnownRequestError("serialization", { code: "P2034", clientVersion: "7.10.0" });
    }
    return result;
  });
  await expect(cancelOrderAsAdmin(publicCode)).resolves.toMatchObject({ cancelledAt: retryNow });
  expect(tx.order.updateMany.mock.calls.map(([query]) => query.data.cancelledAt)).toEqual([now, retryNow]);
});

test("Admin canonical restoration failure rejects the transaction without rewriting snapshots", async () => {
  tx.order.findUnique.mockResolvedValue(placedOrder({ items: [
    { groupBuyItemId: itemBId, quantity: 3, groupBuyItem: { stock: 1 } },
    { groupBuyItemId: itemAId, quantity: 2, groupBuyItem: { stock: 1 } },
  ] }));
  tx.groupBuyItem.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
  await expectCode(cancelOrderAsAdmin(publicCode), "FAILED");
  expect(tx.groupBuyItem.updateMany.mock.calls.map(([query]) => query.where.id)).toEqual([itemAId, itemBId]);
  expect(Object.keys(tx.order.updateMany.mock.calls[0][0].data).sort()).toEqual(["cancelledAt", "status"]);
  expect(db.$transaction).toHaveBeenCalledTimes(1);
});

test("Admin unexpected database errors are sanitized without retry", async () => {
  tx.order.findUnique.mockRejectedValue(new Error("SQL private stock value"));
  await expect(cancelOrderAsAdmin(publicCode)).rejects.toMatchObject({ code: "FAILED", message: "The cancellation failed." });
  expect(db.$transaction).toHaveBeenCalledTimes(1);
});

test.each(["customer", "admin"])("%s paid rejects before cutoff or stock writes", async (actor) => {
  const order = placedOrder({ paidAt: now, groupBuy: { endAt: new Date(0) } });
  tx.order.findFirst.mockResolvedValue(order);
  tx.order.findUnique.mockResolvedValue(order);
  await expectCode(actor === "admin" ? cancelOrderAsAdmin(publicCode) : cancelOrder(publicCode, token), "ALREADY_PAID");
  expect(tx.order.updateMany).not.toHaveBeenCalled();
  expect(tx.groupBuyItem.updateMany).not.toHaveBeenCalled();
});

test.each(["customer", "admin"])("%s pickup refusal takes precedence over paid refusal", async (actor) => {
  const order = placedOrder({ paidAt: now, pickedUpAt: now });
  tx.order.findFirst.mockResolvedValue(order);
  tx.order.findUnique.mockResolvedValue(order);
  await expectCode(actor === "admin" ? cancelOrderAsAdmin(publicCode) : cancelOrder(publicCode, token), "ALREADY_PICKED_UP");
});

test.each(["customer", "admin"])("%s corrupt cancelled payment is not idempotent success", async (actor) => {
  const order = placedOrder({ status: "CANCELLED", cancelledAt: now, paidAt: now });
  tx.order.findFirst.mockResolvedValue(order);
  tx.order.findUnique.mockResolvedValue(order);
  await expectCode(actor === "admin" ? cancelOrderAsAdmin(publicCode) : cancelOrder(publicCode, token), "FAILED");
  expect(tx.order.updateMany).not.toHaveBeenCalled();
  expect(tx.groupBuyItem.updateMany).not.toHaveBeenCalled();
});

test.each(["customer", "admin"])("%s lost claim rereads payment without stock restoration", async (actor) => {
  const reader = actor === "admin" ? tx.order.findUnique : tx.order.findFirst;
  reader.mockResolvedValueOnce(placedOrder()).mockResolvedValueOnce(placedOrder({ paidAt: now }));
  tx.order.updateMany.mockResolvedValueOnce({ count: 0 });
  await expectCode(actor === "admin" ? cancelOrderAsAdmin(publicCode) : cancelOrder(publicCode, token), "ALREADY_PAID");
  expect(reader).toHaveBeenCalledTimes(2);
  expect(tx.groupBuyItem.updateMany).not.toHaveBeenCalled();
});

test("wrong customer token cannot disclose payment", async () => {
  tx.order.findFirst.mockImplementation(async ({ where }) =>
    where.accessTokenHash === hashOrderAccessToken(token) ? placedOrder({ paidAt: now }) : null);
  await expectCode(cancelOrder(publicCode, "B".repeat(43)), "ACCESS_DENIED");
  expect(tx.order.updateMany).not.toHaveBeenCalled();
});
