// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  order: { findUnique: vi.fn() },
  shipment: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
}));
const db = vi.hoisted(() => ({ $transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
import {
  createShipmentAsAdmin, markShipmentShippedAsAdmin, markShipmentArrivedAsAdmin,
  markShipmentReturnedAsAdmin, voidShipmentAsAdmin,
} from "@/lib/shipments/service";

const now = new Date("2026-09-24T00:00:00.000Z");
const code = "ord-AbCdEf0123_-xyZ9";
const orderId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const shipmentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const order = {
  id: orderId, shipmentRequired: true, fulfillmentMethod: "SEVEN_ELEVEN", status: "PLACED",
  cancelledAt: null, pickedUpAt: null, customerName: "Name", customerPhone: "Phone",
  sevenElevenStoreId: "Id", sevenElevenStoreName: "Store", sevenElevenStoreAddress: "Address",
  groupBuy: { endAt: now },
};
const shipment = {
  id: shipmentId, orderId, provider: "SEVEN_ELEVEN_MYSHIP", trackingNumber: "Case-123",
  recipientName: "Name", recipientPhone: "Phone", sevenElevenStoreId: "Id",
  sevenElevenStoreName: "Store", sevenElevenStoreAddress: "Address",
  shippedAt: null, arrivedAt: null, returnedAt: null, voidedAt: null,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.resetAllMocks();
  db.$transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  tx.$queryRaw.mockResolvedValue([{ id: orderId }]);
  tx.order.findUnique.mockResolvedValue(order);
  tx.shipment.findFirst.mockResolvedValue(null);
  tx.shipment.findUnique.mockResolvedValue(null);
  tx.shipment.create.mockResolvedValue(shipment);
  tx.shipment.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.useRealTimers());

test("creation trims but preserves case and copies authoritative snapshots", async () => {
  await expect(createShipmentAsAdmin(code, "  Case-123  ")).resolves.toEqual(shipment);
  expect(tx.shipment.create).toHaveBeenCalledExactlyOnceWith({ data: {
    orderId, provider: "SEVEN_ELEVEN_MYSHIP", trackingNumber: "Case-123",
    recipientName: "Name", recipientPhone: "Phone", sevenElevenStoreId: "Id",
    sevenElevenStoreName: "Store", sevenElevenStoreAddress: "Address",
  } });
  expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
});
test.each(["", "  ", "x".repeat(129), null, 123])("invalid tracking input rejects before DB", async (number) => {
  await expect(createShipmentAsAdmin(code, number)).rejects.toMatchObject({ code: "INVALID_SHIPMENT_INPUT" });
  expect(db.$transaction).not.toHaveBeenCalled();
});
test.each([
  ["legacy", { shipmentRequired: false }],
  ["self pickup", { fulfillmentMethod: "SELF_PICKUP" }],
  ["cancelled", { status: "CANCELLED" }],
  ["picked up", { pickedUpAt: now }],
  ["before cutoff", { groupBuy: { endAt: new Date(now.getTime() + 1) } }],
])("%s is ineligible", async (_label, change) => {
  tx.order.findUnique.mockResolvedValue({ ...order, ...change });
  await expect(createShipmentAsAdmin(code, "Case-123")).rejects.toMatchObject({ code: "ORDER_NOT_ELIGIBLE" });
  expect(tx.shipment.create).not.toHaveBeenCalled();
});
test("paid Order remains eligible without payment mutation", async () => {
  tx.order.findUnique.mockResolvedValue({ ...order, paidAt: now });
  await expect(createShipmentAsAdmin(code, "Case-123")).resolves.toEqual(shipment);
  expect(tx.order).not.toHaveProperty("updateMany");
});
test("same active tracking and snapshots returns existing without write", async () => {
  tx.shipment.findFirst.mockResolvedValue(shipment);
  await expect(createShipmentAsAdmin(code, "Case-123")).resolves.toEqual(shipment);
  expect(tx.shipment.create).not.toHaveBeenCalled();
});
test("active different tracking blocks; terminal tracking reuse blocks", async () => {
  tx.shipment.findFirst.mockResolvedValueOnce({ ...shipment, trackingNumber: "Other" });
  await expect(createShipmentAsAdmin(code, "Case-123")).rejects.toMatchObject({ code: "ACTIVE_SHIPMENT_EXISTS" });
  tx.shipment.findUnique.mockResolvedValueOnce({ id: shipmentId });
  await expect(createShipmentAsAdmin(code, "Case-123")).rejects.toMatchObject({ code: "TRACKING_NUMBER_IN_USE" });
});
test("retry rechecks fresh endAt and never creates after extension", async () => {
  tx.$queryRaw.mockRejectedValueOnce({ cause: { kind: "TransactionWriteConflict", originalCode: "40001" } });
  tx.order.findUnique.mockResolvedValue({ ...order, groupBuy: { endAt: new Date(now.getTime() + 1) } });
  await expect(createShipmentAsAdmin(code, "Case-123")).rejects.toMatchObject({ code: "ORDER_NOT_ELIGIBLE" });
  expect(db.$transaction).toHaveBeenCalledTimes(2);
});

function transitionRow(changes: Record<string, unknown> = {}) {
  return { ...shipment, order, ...changes };
}
test("ship, arrive, return and void use conditional writes and server time", async () => {
  for (const [operation, row, field] of [
    [markShipmentShippedAsAdmin, transitionRow(), "shippedAt"],
    [markShipmentArrivedAsAdmin, transitionRow({ shippedAt: now }), "arrivedAt"],
    [markShipmentReturnedAsAdmin, transitionRow({ shippedAt: now }), "returnedAt"],
    [voidShipmentAsAdmin, transitionRow(), "voidedAt"],
  ] as const) {
    tx.shipment.findUnique.mockResolvedValueOnce(row).mockResolvedValueOnce({ ...shipment, [field]: now });
    await expect(operation(shipmentId)).resolves.toMatchObject({ [field]: now });
    expect(tx.shipment.updateMany.mock.lastCall?.[0].data).toEqual({ [field]: now });
  }
});
test("duplicates return stored timestamps without overwrite", async () => {
  for (const [operation, row] of [
    [markShipmentShippedAsAdmin, transitionRow({ shippedAt: now })],
    [markShipmentArrivedAsAdmin, transitionRow({ shippedAt: now, arrivedAt: now })],
    [markShipmentReturnedAsAdmin, transitionRow({ shippedAt: now, returnedAt: now })],
    [voidShipmentAsAdmin, transitionRow({ voidedAt: now })],
  ] as const) {
    tx.shipment.findUnique.mockResolvedValueOnce(row);
    await expect(operation(shipmentId)).resolves.toMatchObject({ id: shipmentId });
  }
  expect(tx.shipment.updateMany).not.toHaveBeenCalled();
});
test.each([
  [markShipmentArrivedAsAdmin, transitionRow(), "arrive before ship"],
  [voidShipmentAsAdmin, transitionRow({ shippedAt: now }), "void after ship"],
  [markShipmentReturnedAsAdmin, transitionRow({ shippedAt: now, order: { ...order, pickedUpAt: now } }), "return after pickup"],
  [markShipmentShippedAsAdmin, transitionRow({ voidedAt: now }), "ship voided"],
])("invalid transition %s", async (operation, row) => {
  tx.shipment.findUnique.mockResolvedValue(row);
  await expect(operation(shipmentId)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  expect(tx.shipment.updateMany).not.toHaveBeenCalled();
});
