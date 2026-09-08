// @vitest-environment node

import { readFile } from "node:fs/promises";
import { beforeEach, expect, test, vi } from "vitest";

const transaction = vi.hoisted(() => ({
  groupBuy: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  groupBuyItem: { create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  groupBuyPickup: { create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  product: { findMany: vi.fn() },
  pickupLocation: { findMany: vi.fn() },
}));
const db = vi.hoisted(() => ({ ...transaction, $transaction: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));

import {
  createGroupBuyDraft,
  getGroupBuyDraftById,
  groupBuyDetailSelect,
  groupBuyPickupOptionSelect,
  groupBuyProductOptionSelect,
  listGroupBuyPickupLocationOptions,
  listGroupBuyProductOptions,
  groupBuyPublishSelect,
  publishGroupBuy,
  updateGroupBuyDraft,
} from "@/lib/group-buys/service";

const groupBuyId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const newProductId = "33333333-3333-4333-8333-333333333333";
const pickupId = "44444444-4444-4444-8444-444444444444";
const newPickupId = "55555555-5555-4555-8555-555555555555";

function input(overrides = {}) {
  return {
    title: "團購",
    description: null,
    coverImageUrl: null,
    startAt: "2026-09-01T10:00",
    endAt: "2026-09-02T10:00",
    items: [{ productId, salePrice: "150", stock: "0", purchaseLimit: "" }],
    pickups: [{ pickupLocationId: pickupId, pickupStartAt: "", pickupEndAt: "" }],
    ...overrides,
  };
}

function existing(status: "DRAFT" | "PUBLISHED" | "CANCELLED" = "DRAFT") {
  return {
    id: groupBuyId,
    status,
    items: [{ id: "66666666-6666-4666-8666-666666666666", productId, salePrice: 120, cost: 70 }],
    pickups: [{ id: "77777777-7777-4777-8777-777777777777", pickupLocationId: pickupId }],
  };
}

const now = new Date("2026-09-01T00:00:00.000Z");
const publishUpdatedAt = new Date("2026-08-31T12:34:56.789Z");

function publishable(overrides = {}) {
  return {
    id: groupBuyId,
    status: "DRAFT" as const,
    startAt: new Date("2026-09-01T01:00:00.000Z"),
    endAt: new Date("2026-09-02T00:00:00.000Z"),
    updatedAt: publishUpdatedAt,
    items: [{ id: "66666666-6666-4666-8666-666666666666", isActive: true, product: { id: productId, isActive: true } }],
    pickups: [{ id: "77777777-7777-4777-8777-777777777777", pickupStartAt: null, pickupEndAt: null, pickupLocation: { id: pickupId, isActive: true } }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (callback) => callback(transaction));
  transaction.product.findMany.mockResolvedValue([{ id: productId, defaultPrice: 120, cost: 70 }]);
  transaction.pickupLocation.findMany.mockResolvedValue([{ id: pickupId }]);
  transaction.groupBuy.create.mockResolvedValue({ id: groupBuyId });
  transaction.groupBuy.findUnique.mockResolvedValue(existing());
  transaction.groupBuy.updateMany.mockResolvedValue({ count: 1 });
  transaction.groupBuyItem.create.mockResolvedValue({ id: "item" });
  transaction.groupBuyItem.update.mockResolvedValue({ id: "item" });
  transaction.groupBuyPickup.create.mockResolvedValue({ id: "pickup" });
  transaction.groupBuyPickup.update.mockResolvedValue({ id: "pickup" });
  transaction.groupBuyItem.deleteMany.mockResolvedValue({ count: 1 });
  transaction.groupBuyPickup.deleteMany.mockResolvedValue({ count: 1 });
});

test("selectors are narrow, active-only for new drafts, and include only current inactive IDs on edit", async () => {
  transaction.product.findMany.mockResolvedValue([]);
  transaction.pickupLocation.findMany.mockResolvedValue([]);
  await listGroupBuyProductOptions();
  expect(transaction.product.findMany).toHaveBeenCalledWith({ where: { isActive: true }, select: groupBuyProductOptionSelect, orderBy: [{ name: "asc" }, { id: "asc" }] });
  await listGroupBuyProductOptions([productId]);
  expect(transaction.product.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { OR: [{ isActive: true }, { id: { in: [productId] } }] } }));
  await listGroupBuyPickupLocationOptions([pickupId]);
  expect(transaction.pickupLocation.findMany).toHaveBeenCalledWith({ where: { OR: [{ isActive: true }, { id: { in: [pickupId] } }] }, select: groupBuyPickupOptionSelect, orderBy: [{ name: "asc" }, { id: "asc" }] });
});

test("detail validates ID and uses explicit ordered aggregate select", async () => {
  expect(await getGroupBuyDraftById("bad")).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(transaction.groupBuy.findUnique).not.toHaveBeenCalled();
  transaction.groupBuy.findUnique.mockResolvedValueOnce({ id: groupBuyId });
  expect((await getGroupBuyDraftById(groupBuyId)).ok).toBe(true);
  expect(transaction.groupBuy.findUnique).toHaveBeenCalledWith({ where: { id: groupBuyId }, select: groupBuyDetailSelect });
});

test("creates the complete DRAFT aggregate in one transaction with server slug, snapshots, defaults, and derived order", async () => {
  const value = input({
    items: [
      { productId, salePrice: "", stock: "0", purchaseLimit: "" },
      { productId: newProductId, salePrice: "250", stock: "5", purchaseLimit: "2" },
    ],
    pickups: [
      { pickupLocationId: pickupId, pickupStartAt: "", pickupEndAt: "" },
      { pickupLocationId: newPickupId, pickupStartAt: "2026-09-03T10:00", pickupEndAt: "2026-09-03T11:00" },
    ],
  });
  transaction.product.findMany.mockResolvedValue([
    { id: productId, defaultPrice: 120, cost: 70 },
    { id: newProductId, defaultPrice: 220, cost: 90 },
  ]);
  transaction.pickupLocation.findMany.mockResolvedValue([{ id: pickupId }, { id: newPickupId }]);
  expect(await createGroupBuyDraft(value)).toEqual({ ok: true, value: { id: groupBuyId } });
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  const data = transaction.groupBuy.create.mock.calls[0][0].data;
  expect(data.status).toBe("DRAFT");
  expect(data.slug).toMatch(/^gb-[A-Za-z0-9_-]{16}$/);
  expect(data).not.toHaveProperty("publishedAt");
  expect(data.items.create).toEqual([
    { productId, salePrice: 120, cost: 70, stock: 0, purchaseLimit: null, sortOrder: 0 },
    { productId: newProductId, salePrice: 250, cost: 90, stock: 5, purchaseLimit: 2, sortOrder: 1 },
  ]);
  expect(data.pickups.create.map((pickup: { sortOrder: number }) => pickup.sortOrder)).toEqual([0, 1]);
});

test("allows an atomic zero-item and zero-pickup draft without master-data reads", async () => {
  expect((await createGroupBuyDraft(input({ items: [], pickups: [] }))).ok).toBe(true);
  expect(transaction.product.findMany).not.toHaveBeenCalled();
  expect(transaction.pickupLocation.findMany).not.toHaveBeenCalled();
  expect(transaction.groupBuy.create.mock.calls[0][0].data.items.create).toEqual([]);
});

test.each([
  ["PRODUCT_UNAVAILABLE", "product"],
  ["PICKUP_LOCATION_UNAVAILABLE", "pickup"],
] as const)("rejects unavailable active master data with %s before aggregate creation", async (error, kind) => {
  if (kind === "product") transaction.product.findMany.mockResolvedValue([]);
  else transaction.pickupLocation.findMany.mockResolvedValue([]);
  expect(await createGroupBuyDraft(input())).toEqual({ ok: false, error });
  expect(transaction.groupBuy.create).not.toHaveBeenCalled();
});

test.each(["PUBLISHED", "CANCELLED"] as const)("refuses to edit %s without writes", async (status) => {
  transaction.groupBuy.findUnique.mockResolvedValue(existing(status));
  expect(await updateGroupBuyDraft(groupBuyId, input())).toEqual({ ok: false, error: "NOT_EDITABLE" });
  expect(transaction.groupBuy.updateMany).not.toHaveBeenCalled();
});

test("returns NOT_FOUND for a missing draft", async () => {
  transaction.groupBuy.findUnique.mockResolvedValue(null);
  expect(await updateGroupBuyDraft(groupBuyId, input())).toEqual({ ok: false, error: "NOT_FOUND" });
});

test("retains inactive existing references, preserves item cost, updates allowed values, and does not query master data", async () => {
  expect((await updateGroupBuyDraft(groupBuyId, input())).ok).toBe(true);
  expect(transaction.product.findMany).not.toHaveBeenCalled();
  expect(transaction.pickupLocation.findMany).not.toHaveBeenCalled();
  expect(transaction.groupBuyItem.update).toHaveBeenCalledWith({ where: { id: existing().items[0].id }, data: { salePrice: 150, stock: 0, purchaseLimit: null, sortOrder: 0 }, select: { id: true } });
  expect(transaction.groupBuyItem.update.mock.calls[0][0].data).not.toHaveProperty("cost");
  expect(transaction.groupBuyItem.update.mock.calls[0][0].data).not.toHaveProperty("isActive");
  expect(transaction.groupBuy.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: groupBuyId, status: "DRAFT" } }));
  expect(transaction.groupBuy.updateMany.mock.calls[0][0].data).not.toHaveProperty("slug");
  expect(transaction.groupBuy.updateMany.mock.calls[0][0].data).not.toHaveProperty("status");
  expect(transaction.groupBuy.updateMany.mock.calls[0][0].data).not.toHaveProperty("publishedAt");
});

test("rejects a blank salePrice on a retained item before writes", async () => {
  expect(await updateGroupBuyDraft(groupBuyId, input({ items: [{ productId, salePrice: "", stock: "", purchaseLimit: "" }] })))
    .toEqual({ ok: false, error: "INVALID_INPUT" });
  expect(transaction.groupBuy.updateMany).not.toHaveBeenCalled();
});

test("new edit assignments require active masters and receive current cost while submitted order determines sortOrder", async () => {
  transaction.product.findMany.mockResolvedValue([{ id: newProductId, defaultPrice: 220, cost: 99 }]);
  transaction.pickupLocation.findMany.mockResolvedValue([{ id: newPickupId }]);
  const value = input({
    items: [
      { productId: newProductId, salePrice: "", stock: "", purchaseLimit: "" },
      { productId, salePrice: "130", stock: "", purchaseLimit: "" },
    ],
    pickups: [
      { pickupLocationId: newPickupId, pickupStartAt: "", pickupEndAt: "" },
      { pickupLocationId: pickupId, pickupStartAt: "", pickupEndAt: "" },
    ],
  });
  expect((await updateGroupBuyDraft(groupBuyId, value)).ok).toBe(true);
  expect(transaction.product.findMany).toHaveBeenCalledWith({ where: { id: { in: [newProductId] }, isActive: true }, select: { id: true, defaultPrice: true, cost: true } });
  expect(transaction.groupBuyItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ productId: newProductId, salePrice: 220, cost: 99, sortOrder: 0 }) }));
  expect(transaction.groupBuyItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sortOrder: 1 }) }));
  expect(transaction.groupBuyPickup.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ pickupLocationId: newPickupId, sortOrder: 0 }) }));
  expect(transaction.groupBuyPickup.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sortOrder: 1 }) }));
});

test("rejects newly added inactive Product or PickupLocation before scalar writes", async () => {
  const newItem = input({ items: [{ productId: newProductId, salePrice: "", stock: "", purchaseLimit: "" }] });
  transaction.product.findMany.mockResolvedValue([]);
  expect(await updateGroupBuyDraft(groupBuyId, newItem)).toEqual({ ok: false, error: "PRODUCT_UNAVAILABLE" });
  transaction.pickupLocation.findMany.mockResolvedValue([]);
  const newPickup = input({ pickups: [{ pickupLocationId: newPickupId, pickupStartAt: "", pickupEndAt: "" }] });
  expect(await updateGroupBuyDraft(groupBuyId, newPickup)).toEqual({ ok: false, error: "PICKUP_LOCATION_UNAVAILABLE" });
  expect(transaction.groupBuy.updateMany).not.toHaveBeenCalled();
});

test("draft conditional update failure returns NOT_EDITABLE before all child synchronization", async () => {
  transaction.groupBuy.updateMany.mockResolvedValueOnce({ count: 0 });
  expect(await updateGroupBuyDraft(groupBuyId, input())).toEqual({ ok: false, error: "NOT_EDITABLE" });
  expect(transaction.groupBuy.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: groupBuyId, status: "DRAFT" } }));
  expect(transaction.groupBuyItem.create).not.toHaveBeenCalled();
  expect(transaction.groupBuyItem.update).not.toHaveBeenCalled();
  expect(transaction.groupBuyItem.deleteMany).not.toHaveBeenCalled();
  expect(transaction.groupBuyPickup.create).not.toHaveBeenCalled();
  expect(transaction.groupBuyPickup.update).not.toHaveBeenCalled();
  expect(transaction.groupBuyPickup.deleteMany).not.toHaveBeenCalled();
});

test("publish validates UUID inside its transaction and loads a narrow aggregate", async () => {
  expect(groupBuyPublishSelect.updatedAt).toBe(true);
  expect(await publishGroupBuy("bad", now)).toEqual({ ok: false, error: "INVALID_INPUT" });
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect(transaction.groupBuy.findUnique).not.toHaveBeenCalled();
  transaction.groupBuy.findUnique.mockResolvedValueOnce(publishable());
  expect((await publishGroupBuy(groupBuyId, now)).ok).toBe(true);
  expect(transaction.groupBuy.findUnique).toHaveBeenCalledWith({ where: { id: groupBuyId }, select: groupBuyPublishSelect });
});

test("publish returns NOT_FOUND for a missing Group Buy", async () => {
  transaction.groupBuy.findUnique.mockResolvedValueOnce(null);
  expect(await publishGroupBuy(groupBuyId, now)).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(transaction.groupBuy.updateMany).not.toHaveBeenCalled();
});

test.each(["PUBLISHED", "CANCELLED"] as const)("publish rejects %s", async (status) => {
  transaction.groupBuy.findUnique.mockResolvedValueOnce(publishable({ status }));
  expect(await publishGroupBuy(groupBuyId, now)).toEqual({ ok: false, error: "NOT_PUBLISHABLE" });
  expect(transaction.groupBuy.updateMany).not.toHaveBeenCalled();
});

test.each([
  ["zero items", { items: [] }, "PUBLISH_NO_ITEMS"],
  ["inactive item", { items: [{ id: "item", isActive: false, product: { id: productId, isActive: true } }] }, "PUBLISH_ITEM_UNAVAILABLE"],
  ["missing Product", { items: [{ id: "item", isActive: true, product: null }] }, "PUBLISH_ITEM_UNAVAILABLE"],
  ["inactive Product", { items: [{ id: "item", isActive: true, product: { id: productId, isActive: false } }] }, "PUBLISH_ITEM_UNAVAILABLE"],
  ["zero pickups", { pickups: [] }, "PUBLISH_NO_PICKUPS"],
  ["inactive PickupLocation", { pickups: [{ id: "pickup", pickupStartAt: null, pickupEndAt: null, pickupLocation: { id: pickupId, isActive: false } }] }, "PUBLISH_PICKUP_UNAVAILABLE"],
  ["missing PickupLocation", { pickups: [{ id: "pickup", pickupStartAt: null, pickupEndAt: null, pickupLocation: null }] }, "PUBLISH_PICKUP_UNAVAILABLE"],
  ["ordering end equal to now", { endAt: now }, "PUBLISH_ORDERING_ENDED"],
  ["ordering end before now", { endAt: new Date(now.getTime() - 1) }, "PUBLISH_ORDERING_ENDED"],
  ["pickup starts before ordering closes", { pickups: [{ id: "pickup", pickupStartAt: new Date("2026-09-01T23:59:59.999Z"), pickupEndAt: new Date("2026-09-03T00:00:00.000Z"), pickupLocation: { id: pickupId, isActive: true } }] }, "PUBLISH_PICKUP_BEFORE_ORDER_END"],
] as const)("publish blocks %s", async (_name, overrides, error) => {
  transaction.groupBuy.findUnique.mockResolvedValueOnce(publishable(overrides));
  expect(await publishGroupBuy(groupBuyId, now)).toEqual({ ok: false, error });
  expect(transaction.groupBuy.updateMany).not.toHaveBeenCalled();
});

test.each([
  ["future start", { startAt: new Date("2026-09-01T01:00:00.000Z") }],
  ["already started", { startAt: new Date("2026-08-31T00:00:00.000Z") }],
  ["null pickup window", {}],
  ["pickup starts at ordering close", { pickups: [{ id: "pickup", pickupStartAt: new Date("2026-09-02T00:00:00.000Z"), pickupEndAt: new Date("2026-09-03T00:00:00.000Z"), pickupLocation: { id: pickupId, isActive: true } }] }],
] as const)("publish accepts %s", async (_name, overrides) => {
  transaction.groupBuy.findUnique.mockResolvedValueOnce(publishable(overrides));
  expect(await publishGroupBuy(groupBuyId, now)).toEqual({ ok: true, value: { id: groupBuyId } });
});

test("successful publish conditionally transitions DRAFT and sets publishedAt to the exact validation time without child writes", async () => {
  transaction.groupBuy.findUnique.mockResolvedValueOnce(publishable());
  expect((await publishGroupBuy(groupBuyId, now)).ok).toBe(true);
  expect(transaction.groupBuy.updateMany).toHaveBeenCalledWith({
    where: { id: groupBuyId, status: "DRAFT", updatedAt: publishUpdatedAt },
    data: { status: "PUBLISHED", publishedAt: now },
  });
  expect(transaction.groupBuyItem.create).not.toHaveBeenCalled();
  expect(transaction.groupBuyItem.update).not.toHaveBeenCalled();
  expect(transaction.groupBuyItem.deleteMany).not.toHaveBeenCalled();
  expect(transaction.groupBuyPickup.create).not.toHaveBeenCalled();
  expect(transaction.groupBuyPickup.update).not.toHaveBeenCalled();
  expect(transaction.groupBuyPickup.deleteMany).not.toHaveBeenCalled();
});

test("publish conditional update count zero maps to NOT_PUBLISHABLE", async () => {
  transaction.groupBuy.findUnique.mockResolvedValueOnce(publishable());
  transaction.groupBuy.updateMany.mockResolvedValueOnce({ count: 0 });
  expect(await publishGroupBuy(groupBuyId, now)).toEqual({ ok: false, error: "NOT_PUBLISHABLE" });
  expect(transaction.groupBuy.findUnique).toHaveBeenCalledTimes(1);
  expect(transaction.groupBuy.updateMany).toHaveBeenCalledTimes(1);
});

test("removes omitted children only inside the target aggregate transaction", async () => {
  expect((await updateGroupBuyDraft(groupBuyId, input({ items: [], pickups: [] }))).ok).toBe(true);
  expect(transaction.groupBuyItem.deleteMany).toHaveBeenCalledWith({ where: { groupBuyId, id: { in: [existing().items[0].id] } } });
  expect(transaction.groupBuyPickup.deleteMany).toHaveBeenCalledWith({ where: { groupBuyId, id: { in: [existing().pickups[0].id] } } });
});

test("maps transaction failures to FAILED without leaking details", async () => {
  db.$transaction.mockRejectedValueOnce(new Error("sensitive SQL"));
  expect(await createGroupBuyDraft(input())).toEqual({ ok: false, error: "FAILED" });
  db.$transaction.mockRejectedValueOnce(new Error("sensitive SQL"));
  expect(await updateGroupBuyDraft(groupBuyId, input())).toEqual({ ok: false, error: "FAILED" });
  db.$transaction.mockRejectedValueOnce(new Error("sensitive SQL"));
  expect(await publishGroupBuy(groupBuyId, now)).toEqual({ ok: false, error: "FAILED" });
});

test("service has no GroupBuy hard delete or Product/PickupLocation mutation", async () => {
  const source = await readFile(new URL("../../src/lib/group-buys/service.ts", import.meta.url), "utf8");
  expect(source).not.toMatch(/groupBuy\.delete(?:Many)?\s*\(/);
  expect(source).not.toMatch(/(?:product|pickupLocation)\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/);
});
