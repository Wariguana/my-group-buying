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
  groupBuyPublishSelect,
  publishGroupBuy,
  updateGroupBuyDraft,
} from "@/lib/group-buys/service";

const groupBuyId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const pickupId = "44444444-4444-4444-8444-444444444444";
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
    ...overrides,
  };
}

function existing(status: "DRAFT" | "PUBLISHED" | "CANCELLED" = "DRAFT") {
  return {
    id: groupBuyId,
    status,
    updatedAt: new Date("2026-08-30T00:00:00.000Z"),
    _count: { orders: 0, skuOffers: 2 },
    images: [],
    items: [{ id: "66666666-6666-4666-8666-666666666666", productId, salePrice: 120, cost: 70, stock: 0, _count: { orderItems: 0 } }],
    pickups: [{ id: "77777777-7777-4777-8777-777777777777", pickupLocationId: pickupId, _count: { orders: 0 } }],
  };
}

function existingWithOrder(overrides = {}) {
  return {
    ...existing("PUBLISHED"),
    _count: { orders: 1, skuOffers: 2 },
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
    _count: { skuOffers: 2 },
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

test("detail validates ID and uses explicit ordered aggregate select", async () => {
  expect(await getGroupBuyDraftById("bad")).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(transaction.groupBuy.findUnique).not.toHaveBeenCalled();
  transaction.groupBuy.findUnique.mockResolvedValueOnce({ id: groupBuyId });
  expect((await getGroupBuyDraftById(groupBuyId)).ok).toBe(true);
  expect(transaction.groupBuy.findUnique).toHaveBeenCalledWith({ where: { id: groupBuyId }, select: groupBuyDetailSelect });
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
  expect(transaction.groupBuyItem.update).not.toHaveBeenCalled();
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

test("returns NOT_FOUND for a missing draft", async () => {
  transaction.groupBuy.findUnique.mockResolvedValue(null);
  expect(await updateGroupBuyDraft(groupBuyId, input())).toEqual({ ok: false, error: "NOT_FOUND" });
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

test("publish uses active inventoried SKU offers and rejects legacy-only catalogues", async () => {
  transaction.groupBuy.findUnique.mockResolvedValue(publishable({ _count: { skuOffers: 0 } }));
  expect(await publishGroupBuy(groupBuyId, now)).toEqual({ ok: false, error: "PUBLISH_NO_ITEMS" });
  expect(transaction.groupBuy.updateMany).not.toHaveBeenCalled();
});
test("publish supports SKU-only groups without legacy item or pickup rows", async () => {
  transaction.groupBuy.findUnique.mockResolvedValue(publishable({ items: [], pickups: [] }));
  expect(await publishGroupBuy(groupBuyId, now)).toEqual({ ok: true, value: { id: groupBuyId } });
  expect(transaction.groupBuy.findUnique).toHaveBeenCalledWith({ where: { id: groupBuyId }, select: groupBuyPublishSelect });
  expect(transaction.groupBuy.updateMany).toHaveBeenCalledWith({ where: { id: groupBuyId, status: "DRAFT", updatedAt: publishUpdatedAt }, data: { status: "PUBLISHED", publishedAt: now } });
});
test.each(["PUBLISHED", "CANCELLED"])("publish rejects existing %s state", async status => {
  transaction.groupBuy.findUnique.mockResolvedValue(publishable({ status }));
  expect(await publishGroupBuy(groupBuyId, now)).toEqual({ ok: false, error: "NOT_PUBLISHABLE" });
  expect(transaction.groupBuy.updateMany).not.toHaveBeenCalled();
});
test("publish rejects ended ordering and concurrent edits before transition", async () => {
  transaction.groupBuy.findUnique.mockResolvedValueOnce(publishable({ endAt: now }));
  expect(await publishGroupBuy(groupBuyId, now)).toEqual({ ok: false, error: "PUBLISH_ORDERING_ENDED" });
  transaction.groupBuy.findUnique.mockResolvedValueOnce(publishable());
  transaction.groupBuy.updateMany.mockResolvedValueOnce({ count: 0 });
  expect(await publishGroupBuy(groupBuyId, now)).toEqual({ ok: false, error: "NOT_PUBLISHABLE" });
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


test("published SKU-only groups save basic data without legacy pickup rows or catalogue writes", async () => {
  transaction.groupBuy.findUnique.mockResolvedValue({ ...existing("PUBLISHED"), items: [], pickups: [], _count: { orders: 0, skuOffers: 2 } });
  expect(await updateGroupBuyDraft(groupBuyId, input({ title: "SKU 團購新名稱" }))).toEqual({ ok: true, value: { id: groupBuyId } });
  expect(transaction.groupBuy.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: "SKU 團購新名稱" }) }));
  expect(transaction.groupBuyItem.create).not.toHaveBeenCalled();
  expect(transaction.groupBuyItem.deleteMany).not.toHaveBeenCalled();
  const query = transaction.groupBuy.findUnique.mock.calls[0][0];
  expect(query.select._count.select.skuOffers.where).toEqual({ isActive: true, sku: { isActive: true, product: { isActive: true, skuInventoryEnabled: true }, inventory: { isNot: null } } });
});

test("published groups with no legacy items or eligible SKU offers still reject before writes", async () => {
  transaction.groupBuy.findUnique.mockResolvedValue({ ...existing("PUBLISHED"), items: [], pickups: [], _count: { orders: 0, skuOffers: 0 } });
  expect(await updateGroupBuyDraft(groupBuyId, input())).toEqual({ ok: false, error: "PUBLISH_NO_ITEMS" });
  expect(transaction.groupBuy.updateMany).not.toHaveBeenCalled();
});

test("published SKU catalogues do not depend on historical pickup settings", async () => {
  transaction.groupBuy.findUnique.mockResolvedValue({ ...existing("PUBLISHED"), _count: { orders: 0, skuOffers: 2 } });
  expect(await updateGroupBuyDraft(groupBuyId, input({ allowsSevenEleven: false }))).toEqual({ ok: true, value: { id: groupBuyId } });
});

function expectHistoricalRowsUntouched() {
  for (const model of [transaction.groupBuyItem, transaction.groupBuyPickup]) {
    for (const method of Object.values(model)) expect(method).not.toHaveBeenCalled();
  }
  expect(transaction.product.findMany).not.toHaveBeenCalled();
  expect(transaction.pickupLocation.findMany).not.toHaveBeenCalled();
}

test("creates only SKU-era basic data and images with a server-generated slug", async () => {
  expect(await createGroupBuyDraft(input({ allowsSevenEleven: true }))).toEqual({ ok: true, value: { id: groupBuyId } });
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  const data = transaction.groupBuy.create.mock.calls[0][0].data;
  expect(data).toEqual({ title: input().title, description: null, status: "DRAFT", allowsSelfPickup: false, slug: expect.stringMatching(/^gb-[A-Za-z0-9_-]{16}$/), startAt: new Date("2026-09-01T02:00:00.000Z"), endAt: new Date("2026-09-02T02:00:00.000Z"), allowsSevenEleven: true, images: { create: [] } });
  expectHistoricalRowsUntouched();
});

test.each(["DRAFT", "PUBLISHED"] as const)("normal %s edits preserve every legacy row and self-pickup setting", async status => {
  const historical = { ...existing(status), allowsSelfPickup: true };
  const snapshot = structuredClone(historical);
  transaction.groupBuy.findUnique.mockResolvedValue(historical);
  expect(await updateGroupBuyDraft(groupBuyId, input({ title: "Updated title", allowsSevenEleven: true }))).toEqual({ ok: true, value: { id: groupBuyId } });
  expect(historical).toEqual(snapshot);
  expectHistoricalRowsUntouched();
  expect(transaction.groupBuy.updateMany.mock.calls[0][0].data).toEqual({ title: "Updated title", description: null, startAt: new Date("2026-09-01T02:00:00.000Z"), endAt: new Date("2026-09-02T02:00:00.000Z"), allowsSevenEleven: true });
  const select = transaction.groupBuy.findUnique.mock.calls[0][0].select;
  expect(select).not.toHaveProperty("items");
  expect(select).not.toHaveProperty("pickups");
});

test.each([
  { items: [] }, { items: [{ productId, salePrice: 1, stock: 999999 }] },
  { pickups: [] }, { pickups: [{ pickupLocationId: pickupId }] }, { allowsSelfPickup: false },
])("rejects retired-field injection before any transaction: %j", async injected => {
  expect(await createGroupBuyDraft(input(injected))).toEqual({ ok: false, error: "INVALID_INPUT" });
  expect(await updateGroupBuyDraft(groupBuyId, input(injected))).toEqual({ ok: false, error: "INVALID_INPUT" });
  expect(db.$transaction).not.toHaveBeenCalled();
  expectHistoricalRowsUntouched();
});

test("transaction conflict retries the basic-data update without writing historical rows", async () => {
  const conflict = new Prisma.PrismaClientKnownRequestError("must not be parsed", { code: "P2034", clientVersion: "7.10.0" });
  let attempts = 0;
  db.$transaction.mockImplementation(async callback => {
    const result = await callback(transaction);
    if (++attempts === 1) throw conflict;
    return result;
  });
  expect(await updateGroupBuyDraft(groupBuyId, input())).toEqual({ ok: true, value: { id: groupBuyId } });
  expect(db.$transaction).toHaveBeenCalledTimes(2);
  expect(transaction.groupBuy.findUnique).toHaveBeenCalledTimes(2);
  expectHistoricalRowsUntouched();
});
