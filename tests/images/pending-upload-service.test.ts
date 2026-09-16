// @vitest-environment node

import sharp from "sharp";
import { beforeEach, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  pendingGroupBuyImageUpload: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));

import { cleanupExpiredPendingUploads, createPendingGroupBuyImageUpload } from "@/lib/images/pending-upload-service";
import type { ImageStorage } from "@/lib/images/storage";

const adminId = "11111111-1111-4111-8111-111111111111";
const pendingId = "22222222-2222-4222-8222-222222222222";

function storage() {
  const putObject = vi.fn(async (image: Parameters<ImageStorage["putObject"]>[0]) => { void image; });
  const deleteObject = vi.fn(async (key: string) => { void key; });
  return { putObject, deleteObject, publicUrlForKey: (key: string) => `https://images.example/${key}` } satisfies ImageStorage;
}

async function png() {
  return new Uint8Array(await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).png().toBuffer());
}

beforeEach(() => {
  vi.resetAllMocks();
  db.pendingGroupBuyImageUpload.create.mockResolvedValue({ id: pendingId, imageUrl: "url", byteSize: 32, mimeType: "image/webp" });
  db.pendingGroupBuyImageUpload.findMany.mockResolvedValue([]);
  db.pendingGroupBuyImageUpload.deleteMany.mockResolvedValue({ count: 1 });
});

test("uploads a server-named WebP before creating a 24-hour pending row", async () => {
  const adapter = storage();
  const now = new Date("2026-09-16T00:00:00.000Z");
  await createPendingGroupBuyImageUpload(adminId, await png(), now, adapter);
  const stored = adapter.putObject.mock.calls[0][0];
  expect(stored.key).toMatch(/^group-buys\/[0-9a-f-]{36}\.webp$/);
  expect(stored.key).not.toContain("original");
  expect(stored.contentType).toBe("image/webp");
  expect((await sharp(stored.bytes).metadata()).format).toBe("webp");
  expect(adapter.putObject.mock.invocationCallOrder[0]).toBeLessThan(db.pendingGroupBuyImageUpload.create.mock.invocationCallOrder[0]);
  expect(db.pendingGroupBuyImageUpload.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    adminUserId: adminId,
    storageKey: stored.key,
    expiresAt: new Date("2026-09-17T00:00:00.000Z"),
    mimeType: "image/webp",
  }) }));
});

test("a storage failure creates no pending database row", async () => {
  const adapter = storage();
  adapter.putObject.mockRejectedValue(new Error("secret provider detail"));
  await expect(createPendingGroupBuyImageUpload(adminId, await png(), new Date(), adapter)).rejects.toThrow();
  expect(db.pendingGroupBuyImageUpload.create).not.toHaveBeenCalled();
});

test("a database failure leaves no referenced object and attempts cleanup", async () => {
  const adapter = storage();
  db.pendingGroupBuyImageUpload.create.mockRejectedValue(new Error("db"));
  await expect(createPendingGroupBuyImageUpload(adminId, await png(), new Date(), adapter)).rejects.toThrow();
  expect(adapter.deleteObject).toHaveBeenCalledWith(adapter.putObject.mock.calls[0][0].key);
});

test("cleanup does not delete storage when another operation wins the conditional DB deletion", async () => {
  const adapter = storage();
  db.pendingGroupBuyImageUpload.findMany.mockResolvedValue([{ id: pendingId, storageKey: "group-buys/old.webp" }]);
  db.pendingGroupBuyImageUpload.deleteMany.mockResolvedValue({ count: 0 });
  await expect(cleanupExpiredPendingUploads(new Date("2026-09-16T00:00:00.000Z"), adapter)).resolves.toBeUndefined();
  expect(adapter.deleteObject).not.toHaveBeenCalled();
});

test("cleanup deletes storage exactly once after it conditionally removes the DB row", async () => {
  const adapter = storage();
  db.pendingGroupBuyImageUpload.findMany.mockResolvedValue([{ id: pendingId, storageKey: "group-buys/old.webp" }]);
  db.pendingGroupBuyImageUpload.deleteMany.mockResolvedValue({ count: 1 });
  await cleanupExpiredPendingUploads(new Date("2026-09-16T00:00:00.000Z"), adapter);
  expect(adapter.deleteObject).toHaveBeenCalledTimes(1);
  expect(adapter.deleteObject).toHaveBeenCalledWith("group-buys/old.webp");
  expect(db.pendingGroupBuyImageUpload.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(adapter.deleteObject.mock.invocationCallOrder[0]);
});

test("cleanup safely absorbs storage failure after successful DB removal", async () => {
  const adapter = storage();
  adapter.deleteObject.mockRejectedValue(new Error("secret provider detail"));
  db.pendingGroupBuyImageUpload.findMany.mockResolvedValue([{ id: pendingId, storageKey: "group-buys/old.webp" }]);
  db.pendingGroupBuyImageUpload.deleteMany.mockResolvedValue({ count: 1 });
  await expect(cleanupExpiredPendingUploads(new Date("2026-09-16T00:00:00.000Z"), adapter)).resolves.toBeUndefined();
  expect(adapter.deleteObject).toHaveBeenCalledTimes(1);
});

test("cleanup keeps the expired-unconsumed predicates and 20-candidate bound", async () => {
  const adapter = storage();
  const now = new Date("2026-09-16T00:00:00.000Z");
  db.pendingGroupBuyImageUpload.findMany.mockResolvedValue([{ id: pendingId, storageKey: "group-buys/old.webp" }]);
  await cleanupExpiredPendingUploads(now, adapter);
  expect(db.pendingGroupBuyImageUpload.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { consumedAt: null, expiresAt: { lt: now } },
    take: 20,
  }));
  expect(db.pendingGroupBuyImageUpload.deleteMany).toHaveBeenCalledWith({
    where: { id: pendingId, consumedAt: null, expiresAt: { lt: now } },
  });
});
