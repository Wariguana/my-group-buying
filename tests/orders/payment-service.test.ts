// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const tx = vi.hoisted(() => ({ order: { findUnique: vi.fn(), updateMany: vi.fn() } }));
const db = vi.hoisted(() => ({ $transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
import { markOrderPaidAsAdmin } from "@/lib/orders/payment-service";
const publicCode = "ord-AbCdEf0123_-xyZ9";
const now = new Date("2026-09-15T01:00:00.000Z");
const row = { id: "order-id", publicCode, status: "PLACED", paidAt: null, pickedUpAt: null, cancelledAt: null };
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  db.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  tx.order.findUnique.mockResolvedValue(row);
  tx.order.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.useRealTimers());

test("server time and exact conditional write; no stock, snapshot or master-data dependencies", async () => {
  await expect(markOrderPaidAsAdmin(publicCode)).resolves.toEqual({ publicCode, paidAt: now });
  expect(tx.order.updateMany).toHaveBeenCalledExactlyOnceWith({
    where: { id: row.id, status: "PLACED", paidAt: null }, data: { paidAt: now },
  });
  expect(tx.order.findUnique).toHaveBeenCalledExactlyOnceWith({
    where: { publicCode }, select: { id: true, publicCode: true, status: true, paidAt: true, pickedUpAt: true, cancelledAt: true },
  });
  expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
});
test("stored payment is idempotent without another write or updatedAt change", async () => {
  const stored = new Date(now.getTime() - 1000);
  tx.order.findUnique.mockResolvedValue({ ...row, paidAt: stored });
  await expect(markOrderPaidAsAdmin(publicCode)).resolves.toEqual({ publicCode, paidAt: stored });
  expect(tx.order.updateMany).not.toHaveBeenCalled();
});
test.each([[null, "CANCELLED"], [now, "FAILED"]])("cancelled state fails closed: %s", async (paidAt, code) => {
  tx.order.findUnique.mockResolvedValue({ ...row, status: "CANCELLED", paidAt, cancelledAt: now });
  await expect(markOrderPaidAsAdmin(publicCode)).rejects.toMatchObject({ code });
  expect(tx.order.updateMany).not.toHaveBeenCalled();
});
test.each(["bad", null, undefined, {}])("invalid code rejected: %s", async (code) => {
  await expect(markOrderPaidAsAdmin(code)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  expect(db.$transaction).not.toHaveBeenCalled();
});
test("missing order rejected", async () => {
  tx.order.findUnique.mockResolvedValue(null);
  await expect(markOrderPaidAsAdmin(publicCode)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
});
test.each(["claim", "conflict"])("%s retries whole attempt with fresh now", async (kind) => {
  const later = new Date(now.getTime() + 1000);
  tx.order.updateMany.mockImplementationOnce(async () => {
    vi.setSystemTime(later);
    if (kind === "conflict") throw { cause: { kind: "TransactionWriteConflict", originalCode: "40001" } };
    return { count: 0 };
  });
  await expect(markOrderPaidAsAdmin(publicCode)).resolves.toEqual({ publicCode, paidAt: later });
  expect(db.$transaction).toHaveBeenCalledTimes(2);
  expect(tx.order.findUnique).toHaveBeenCalledTimes(2);
  expect(tx.order.updateMany.mock.calls.map(([arg]) => arg.data.paidAt)).toEqual([now, later]);
});
test("claim loser rereads winner without overwriting", async () => {
  tx.order.updateMany.mockResolvedValueOnce({ count: 0 });
  tx.order.findUnique.mockResolvedValueOnce(row).mockResolvedValueOnce({ ...row, paidAt: now });
  await expect(markOrderPaidAsAdmin(publicCode)).resolves.toEqual({ publicCode, paidAt: now });
  expect(tx.order.updateMany).toHaveBeenCalledTimes(1);
});
test("unexpected DB error sanitized", async () => {
  tx.order.findUnique.mockRejectedValue(new Error("secret SQL"));
  await expect(markOrderPaidAsAdmin(publicCode)).rejects.toMatchObject({ code: "FAILED", message: "The payment failed." });
  expect(db.$transaction).toHaveBeenCalledTimes(1);
});

test("picked-up orders may be paid without overwriting fulfillment", async () => {
  tx.order.findUnique.mockResolvedValue({ ...row, pickedUpAt: new Date(now.getTime() - 1000) });
  await expect(markOrderPaidAsAdmin(publicCode)).resolves.toEqual({ publicCode, paidAt: now });
  expect(tx.order.updateMany).toHaveBeenCalledExactlyOnceWith({
    where: { id: row.id, status: "PLACED", paidAt: null }, data: { paidAt: now },
  });
});

test.each([
  { paidAt: now, pickedUpAt: null, cancelledAt: now },
  { paidAt: null, pickedUpAt: now, cancelledAt: now },
  { paidAt: null, pickedUpAt: null, cancelledAt: null },
])("corrupt cancelled state fails closed before any write: %j", async (state) => {
  tx.order.findUnique.mockResolvedValue({ ...row, status: "CANCELLED", ...state });
  await expect(markOrderPaidAsAdmin(publicCode)).rejects.toMatchObject({ code: "FAILED" });
  expect(tx.order.updateMany).not.toHaveBeenCalled();
});

test("a lost payment claim rereads cancellation and rejects", async () => {
  tx.order.updateMany.mockResolvedValueOnce({ count: 0 });
  tx.order.findUnique.mockResolvedValueOnce(row)
    .mockResolvedValueOnce({ ...row, status: "CANCELLED", cancelledAt: now });
  await expect(markOrderPaidAsAdmin(publicCode)).rejects.toMatchObject({ code: "CANCELLED" });
  expect(tx.order.findUnique).toHaveBeenCalledTimes(2);
  expect(tx.order.updateMany).toHaveBeenCalledTimes(1);
});
