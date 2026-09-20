// @vitest-environment node

import { readFile } from "node:fs/promises";
import { beforeEach, expect, test, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client";

const transaction = vi.hoisted(() => ({
  groupBuy: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  groupBuyImage: { create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  pendingGroupBuyImageUpload: { findMany: vi.fn(), updateMany: vi.fn() },
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
const adminId = "88888888-8888-4888-8888-888888888888";
const existingImageId = "99999999-9999-4999-8999-999999999999";
const pendingUploadId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function input(overrides = {}) {
  return {
    title: "團購",
    description: null,
    gallery: [],
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
    updatedAt: new Date("2026-08-30T00:00:00.000Z"),
    _count: { orders: 0 },
    images: [],
    items: [{ id: "66666666-6666-4666-8666-666666666666", productId, salePrice: 120, cost: 70, stock: 0, _count: { orderItems: 0 } }],
    pickups: [{ id: "77777777-7777-4777-8777-777777777777", pickupLocationId: pickupId, _count: { orders: 0 } }],
  };
}

function existingWithOrder(overrides = {}) {
  return {
    ...existing("PUBLISHED"),
    _count: { orders: 1 },
    items: existing().items.map((item) => ({ ...item, _count: { orderItems: 1 } })),
    pickups: existing().pickups.map((pickup) => ({ ...pickup, _count: { orders: 1 } })),
    ...overrides,
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
  transaction.pendingGroupBuyImageUpload.findMany.mockResolvedValue([]);
  transaction.pendingGroupBuyImageUpload.updateMany.mockResolvedValue({ count: 0 });
  transaction.groupBuyImage.create.mockResolvedValue({ id: "image" });
  transaction.groupBuyImage.update.mockResolvedValue({ id: "image" });
  transaction.groupBuyImage.deleteMany.mockResolvedValue({ count: 0 });
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

test("creates a Group Buy with ordered pending images and consumes them atomically", async () => {
  const secondUploadId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  transaction.pendingGroupBuyImageUpload.findMany.mockResolvedValue([
    { id: pendingUploadId, imageUrl: "https://images.example/one.webp", storageKey: "group-buys/one.webp" },
    { id: secondUploadId, imageUrl: "https://images.example/two.webp", storageKey: "group-buys/two.webp" },
  ]);
  transaction.pendingGroupBuyImageUpload.updateMany.mockResolvedValue({ count: 2 });
  const result = await createGroupBuyDraft(input({
    gallery: [{ kind: "pending", uploadId: secondUploadId }, { kind: "pending", uploadId: pendingUploadId }],
  }), adminId);
  expect(result).toEqual({ ok: true, value: { id: groupBuyId } });
  expect(transaction.pendingGroupBuyImageUpload.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ adminUserId: adminId, consumedAt: null, expiresAt: { gt: expect.any(Date) } }),
  }));
  expect(transaction.groupBuy.create.mock.calls[0][0].data.images.create).toEqual([
    { imageUrl: "https://images.example/two.webp", storageKey: "group-buys/two.webp", sortOrder: 0 },
    { imageUrl: "https://images.example/one.webp", storageKey: "group-buys/one.webp", sortOrder: 1 },
  ]);
  expect(transaction.pendingGroupBuyImageUpload.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { consumedAt: expect.any(Date) } }));
});

test.each([
  ["another Admin", []],
  ["expired upload", []],
  ["consumed upload", []],
] as const)("rejects an unavailable pending upload: %s", async (_label, rows) => {
  transaction.pendingGroupBuyImageUpload.findMany.mockResolvedValue(rows);
  expect(await createGroupBuyDraft(input({ gallery: [{ kind: "pending", uploadId: pendingUploadId }] }), adminId))
    .toEqual({ ok: false, error: "IMAGE_UPLOAD_UNAVAILABLE" });
  expect(transaction.groupBuy.create).not.toHaveBeenCalled();
});

test("a create payload cannot attach an existing image identity", async () => {
  expect(await createGroupBuyDraft(input({ gallery: [{ kind: "existing", id: existingImageId }] }), adminId))
    .toEqual({ ok: false, error: "IMAGE_NOT_FOUND" });
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

test("refuses to edit CANCELLED without writes", async () => {
  transaction.groupBuy.findUnique.mockResolvedValue(existing("CANCELLED"));
  expect(await updateGroupBuyDraft(groupBuyId, input())).toEqual({ ok: false, error: "NOT_EDITABLE" });
  expect(transaction.groupBuy.updateMany).not.toHaveBeenCalled();
});

test("allows a full PUBLISHED edit when no Orders exist", async () => {
  transaction.groupBuy.findUnique.mockResolvedValue(existing("PUBLISHED"));
  expect(await updateGroupBuyDraft(groupBuyId, input({ title: "已發布新標題" }))).toEqual({ ok: true, value: { id: groupBuyId } });
  expect(transaction.groupBuy.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: groupBuyId, status: "PUBLISHED", updatedAt: existing().updatedAt },
    data: expect.objectContaining({ title: "已發布新標題" }),
  }));
  expect(transaction.groupBuyItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stock: 0 }) }));
});

test("edits future-facing values with Orders without rewriting stock or snapshots", async () => {
  transaction.groupBuy.findUnique.mockResolvedValue(existingWithOrder({
    items: existing().items.map((item) => ({ ...item, stock: 8, _count: { orderItems: 1 } })),
  }));
  expect(await updateGroupBuyDraft(groupBuyId, input({
    title: "後續標題",
    description: "後續說明",
    gallery: [],
    items: [{ productId, salePrice: "199", stock: "9", purchaseLimit: "2" }],
    pickups: [{ pickupLocationId: pickupId, pickupStartAt: "2026-09-03T10:00", pickupEndAt: "2026-09-03T11:00" }],
  }))).toEqual({ ok: true, value: { id: groupBuyId } });
  expect(transaction.groupBuyItem.update).toHaveBeenCalledWith(expect.objectContaining({
    data: { salePrice: 199, purchaseLimit: 2, sortOrder: 0 },
  }));
  expect(transaction.groupBuyPickup.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      pickupStartAt: new Date("2026-09-03T02:00:00.000Z"),
      pickupEndAt: new Date("2026-09-03T03:00:00.000Z"),
    }),
  }));
  expect(transaction).not.toHaveProperty("order.update");
});

test("updates a published gallery with Orders by mixing existing and pending images in contiguous order", async () => {
  transaction.groupBuy.findUnique.mockResolvedValue(existingWithOrder({
    images: [{ id: existingImageId, storageKey: "group-buys/existing.webp" }],
  }));
  transaction.pendingGroupBuyImageUpload.findMany.mockResolvedValue([
    { id: pendingUploadId, imageUrl: "https://images.example/new.webp", storageKey: "group-buys/new.webp" },
  ]);
  transaction.pendingGroupBuyImageUpload.updateMany.mockResolvedValue({ count: 1 });
  const result = await updateGroupBuyDraft(groupBuyId, input({
    gallery: [{ kind: "pending", uploadId: pendingUploadId }, { kind: "existing", id: existingImageId }],
  }), adminId);
  expect(result).toEqual({ ok: true, value: { id: groupBuyId } });
  expect(transaction.groupBuyImage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sortOrder: 0 }) }));
  expect(transaction.groupBuyImage.update).toHaveBeenCalledWith({ where: { id: existingImageId }, data: { sortOrder: 1 }, select: { id: true } });
  expect(transaction).not.toHaveProperty("order.update");
});

test("rejects an existing image owned by another Group Buy", async () => {
  transaction.groupBuy.findUnique.mockResolvedValue(existing());
  expect(await updateGroupBuyDraft(groupBuyId, input({ gallery: [{ kind: "existing", id: existingImageId }] }), adminId))
    .toEqual({ ok: false, error: "IMAGE_NOT_FOUND" });
  expect(transaction.groupBuy.updateMany).not.toHaveBeenCalled();
});

test("returns uploaded storage keys after commit but never returns a deletion key for legacy external images", async () => {
  transaction.groupBuy.findUnique.mockResolvedValueOnce({
    ...existing(),
    images: [
      { id: existingImageId, storageKey: "group-buys/remove.webp" },
      { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", storageKey: null },
    ],
  });
  expect(await updateGroupBuyDraft(groupBuyId, input({ gallery: [] }), adminId)).toEqual({
    ok: true,
    value: { id: groupBuyId, removedStorageKeys: ["group-buys/remove.webp"] },
  });
  expect(transaction.groupBuyImage.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ groupBuyId }) }));
});

test("ignores forged existing-item stock after an Order exists", async () => {
  transaction.groupBuy.findUnique.mockResolvedValue(existingWithOrder({
    items: existing().items.map((item) => ({ ...item, stock: 8, _count: { orderItems: 1 } })),
  }));
  expect(await updateGroupBuyDraft(groupBuyId, input({
    items: [{ productId, salePrice: "150", stock: "999999", purchaseLimit: "" }],
  }))).toEqual({ ok: true, value: { id: groupBuyId } });
  expect(transaction.groupBuyItem.update.mock.calls[0][0].data).not.toHaveProperty("stock");
});

test("a transaction-conflict retry reruns the complete edit and freshly makes existing-item stock non-authoritative", async () => {
  const conflict = new Prisma.PrismaClientKnownRequestError("must not be parsed", {
    code: "P2034",
    clientVersion: "7.10.0",
  });
  transaction.groupBuy.findUnique
    .mockResolvedValueOnce({
      ...existing("PUBLISHED"),
      items: existing().items.map((item) => ({ ...item, stock: 9 })),
    })
    .mockResolvedValueOnce(existingWithOrder({
      items: existing().items.map((item) => ({
        ...item,
        stock: 8,
        _count: { orderItems: 1 },
      })),
    }));
  let attempts = 0;
  db.$transaction.mockImplementation(async (callback) => {
    attempts += 1;
    const result = await callback(transaction);
    if (attempts === 1) throw conflict;
    return result;
  });
  const random = vi.spyOn(Math, "random").mockReturnValue(0);

  try {
    await expect(updateGroupBuyDraft(groupBuyId, input({
      items: [{ productId, salePrice: "150", stock: "999999", purchaseLimit: "2" }],
    }))).resolves.toEqual({ ok: true, value: { id: groupBuyId } });
  } finally {
    random.mockRestore();
  }

  expect(db.$transaction).toHaveBeenCalledTimes(2);
  expect(transaction.groupBuy.findUnique).toHaveBeenCalledTimes(2);
  expect(transaction.groupBuy.updateMany).toHaveBeenCalledTimes(2);
  expect(transaction.groupBuyItem.update.mock.calls[0][0].data).toMatchObject({ stock: 999999 });
  expect(transaction.groupBuyItem.update.mock.calls[1][0].data).not.toHaveProperty("stock");
});

test("maps exhausted transaction conflicts to the existing safe failure after exactly three attempts", async () => {
  const conflict = new Prisma.PrismaClientKnownRequestError("must not be parsed", {
    code: "P2034",
    clientVersion: "7.10.0",
  });
  db.$transaction.mockRejectedValue(conflict);
  const random = vi.spyOn(Math, "random").mockReturnValue(0);

  try {
    await expect(updateGroupBuyDraft(groupBuyId, input())).resolves.toEqual({
      ok: false,
      error: "FAILED",
    });
  } finally {
    random.mockRestore();
  }

  expect(db.$transaction).toHaveBeenCalledTimes(3);
});

test.each([
  ["referenced item", { items: [], pickups: input().pickups }, "ITEM_IN_USE"],
  ["referenced pickup", { items: input().items, pickups: [] }, "PICKUP_IN_USE"],
] as const)("cannot remove a %s", async (_name, changes, error) => {
  transaction.groupBuy.findUnique.mockResolvedValue(existingWithOrder());
  expect(await updateGroupBuyDraft(groupBuyId, input(changes))).toEqual({ ok: false, error });
  expect(transaction.groupBuyItem.deleteMany).not.toHaveBeenCalled();
  expect(transaction.groupBuyPickup.deleteMany).not.toHaveBeenCalled();
});

test("may remove unreferenced published children while retaining valid alternatives", async () => {
  const old = existingWithOrder({
    items: existing().items.map((item) => ({ ...item, _count: { orderItems: 0 } })),
    pickups: existing().pickups.map((pickup) => ({ ...pickup, _count: { orders: 0 } })),
  });
  transaction.groupBuy.findUnique.mockResolvedValue(old);
  transaction.product.findMany.mockResolvedValue([{ id: newProductId, defaultPrice: 220, cost: 99 }]);
  transaction.pickupLocation.findMany.mockResolvedValue([{ id: newPickupId }]);
  expect((await updateGroupBuyDraft(groupBuyId, input({
    items: [{ productId: newProductId, salePrice: "220", stock: "5", purchaseLimit: "" }],
    pickups: [{ pickupLocationId: newPickupId, pickupStartAt: "", pickupEndAt: "" }],
  }))).ok).toBe(true);
  expect(transaction.groupBuyItem.deleteMany).toHaveBeenCalled();
  expect(transaction.groupBuyPickup.deleteMany).toHaveBeenCalled();
});

test("rejects a published pickup window that starts before the edited ordering end", async () => {
  transaction.groupBuy.findUnique.mockResolvedValue(existing("PUBLISHED"));
  expect(await updateGroupBuyDraft(groupBuyId, input({
    endAt: "2026-09-04T10:00",
    pickups: [{ pickupLocationId: pickupId, pickupStartAt: "2026-09-04T09:00", pickupEndAt: "2026-09-04T11:00" }],
  }))).toEqual({ ok: false, error: "PUBLISH_PICKUP_BEFORE_ORDER_END" });
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
  expect(transaction.groupBuy.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: groupBuyId, status: "DRAFT", updatedAt: existing().updatedAt } }));
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
  expect(transaction.groupBuy.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: groupBuyId, status: "DRAFT", updatedAt: existing().updatedAt } }));
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

test.each([
  ["self-pickup only", { allowsSelfPickup: true, allowsSevenEleven: false }],
  ["7-ELEVEN only", { allowsSelfPickup: false, allowsSevenEleven: true, pickups: [] }],
  ["both methods", { allowsSelfPickup: true, allowsSevenEleven: true }],
] as const)("publish accepts %s fulfillment configuration", async (_label, overrides) => {
  transaction.groupBuy.findUnique.mockResolvedValueOnce(publishable(overrides));
  await expect(publishGroupBuy(groupBuyId, now)).resolves.toEqual({ ok: true, value: { id: groupBuyId } });
});

test("publish rejects no enabled fulfillment method", async () => {
  transaction.groupBuy.findUnique.mockResolvedValueOnce(publishable({ allowsSelfPickup: false, allowsSevenEleven: false }));
  await expect(publishGroupBuy(groupBuyId, now)).resolves.toEqual({ ok: false, error: "PUBLISH_NO_FULFILLMENT_METHOD" });
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
