// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(), $queryRaw: vi.fn(),
  user: { findFirst: vi.fn() }, checkout: { findUniqueOrThrow: vi.fn() },
  fulfillmentGroup: { findUniqueOrThrow: vi.fn() }, groupBuy: { findMany: vi.fn() },
  shippingRate: { findUnique: vi.fn() }, checkoutItem: { findMany: vi.fn() },
  qbShipment: { findUnique: vi.fn(), create: vi.fn() }, qbShipmentEvent: { create: vi.fn() },
  qbReturnCase: { findUniqueOrThrow: vi.fn(), update: vi.fn() }, checkoutAudit: { create: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
import { createShipment, inspectReturn } from "@/lib/qbuy/service";

const id = "11111111-1111-4111-8111-111111111111";
const group = { id, checkoutId: id, method: "HOME_DELIVERY", temperature: "AMBIENT", waitUntil: new Date(0) };
const snapshot = { methods: ["HOME_DELIVERY"], weightGrams: 100, lengthMm: 50, widthMm: 300, heightMm: 200, note: null };
const item = { id, skuId: id, groupBuyId: id, fulfillmentGroupId: id, quantity: 2, shippingSnapshot: snapshot };
const command = { requestId: id, evidence: "verified", confirmed: true };

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(fn => fn(db));
  db.$queryRaw.mockResolvedValue([{ latest: null }]);
  db.user.findFirst.mockResolvedValue({ id });
  db.fulfillmentGroup.findUniqueOrThrow.mockResolvedValue(group);
  db.checkout.findUniqueOrThrow.mockResolvedValue({ id, status: "FINALIZED", payment: { status: "FINALIZED" }, items: [item], orders: [{ groupBuyId: id, status: "PAID" }], fulfillmentGroups: [group], cancellations: [], qbShipments: [], delivery: { address: "valid address" }, customerName: "customer", customerPhone: "0912345678" });
  db.groupBuy.findMany.mockResolvedValue([{ endAt: new Date(0), status: "PUBLISHED" }]);
  db.shippingRate.findUnique.mockResolvedValue({ enabled: true, capabilityEvidence: "verified", maxWeightGrams: 1000, maxLengthMm: 300, maxWidthMm: 200, maxHeightMm: 100, fee: 70 });
  db.qbShipment.create.mockResolvedValue({ id });
  db.checkoutItem.findMany.mockResolvedValue([item]);
  db.qbReturnCase.findUniqueOrThrow.mockResolvedValue({ id, checkoutId: id, status: "RECEIVED", shipment: { fulfillmentGroupId: id, items: [{ id, skuId: id, groupBuyId: id, quantity: 2 }] } });
});

test("shipment creation accepts the rotated package accepted at checkout", async () => {
  await createShipment(id, { ...command, groupId: id, trackingNumber: "test-tracking" });
  expect(db.qbShipment.create).toHaveBeenCalledOnce();
});

test("return inspection accepts the same rotated package", async () => {
  await inspectReturn(id, { ...command, returnId: id, quality: "PASS", quantity: 2, responsibility: "CUSTOMER", method: "HOME_DELIVERY", address: "valid address" });
  expect(db.qbReturnCase.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "AWAITING_FEE" }) }));
});

test.each(["create", "inspect"])("%s refuses accumulated package overflow before mutation", async operation => {
  db.shippingRate.findUnique.mockResolvedValue({ enabled: true, capabilityEvidence: "verified", maxWeightGrams: 1000, maxLengthMm: 300, maxWidthMm: 200, maxHeightMm: 75, fee: 70 });
  const work = operation === "create"
    ? createShipment(id, { ...command, groupId: id, trackingNumber: "test-tracking" })
    : inspectReturn(id, { ...command, returnId: id, quality: "PASS", quantity: 2, responsibility: "CUSTOMER", method: "HOME_DELIVERY", address: "valid address" });
  await expect(work).rejects.toThrow();
  expect(db.qbShipment.create).not.toHaveBeenCalled();
  expect(db.qbReturnCase.update).not.toHaveBeenCalled();
});
