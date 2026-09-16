import "server-only";

import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { getImageStorage, type ImageStorage } from "@/lib/images/storage";
import { normalizeGroupBuyImage } from "@/lib/images/normalize";

const PENDING_UPLOAD_LIFETIME_MS = 24 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 20;

export async function cleanupExpiredPendingUploads(
  now = new Date(),
  storage: ImageStorage = getImageStorage(),
): Promise<void> {
  try {
    const expired = await getDb().pendingGroupBuyImageUpload.findMany({
      where: { consumedAt: null, expiresAt: { lt: now } },
      select: { id: true, storageKey: true },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: CLEANUP_BATCH_SIZE,
    });
    for (const upload of expired) {
      const claimed = await getDb().pendingGroupBuyImageUpload.deleteMany({
        where: { id: upload.id, consumedAt: null, expiresAt: { lt: now } },
      });
      if (claimed.count !== 1) continue;
      try { await storage.deleteObject(upload.storageKey); } catch { /* orphan cleanup is best effort */ }
    }
  } catch {
    // Opportunistic cleanup must not make a new upload fail.
  }
}

export async function createPendingGroupBuyImageUpload(
  adminUserId: string,
  rawBytes: Uint8Array,
  now = new Date(),
  storage: ImageStorage = getImageStorage(),
) {
  const normalized = await normalizeGroupBuyImage(rawBytes);
  const storageKey = `group-buys/${randomUUID()}.webp`;
  await storage.putObject({ key: storageKey, bytes: normalized, contentType: "image/webp" });
  try {
    return await getDb().pendingGroupBuyImageUpload.create({
      data: {
        adminUserId,
        storageKey,
        imageUrl: storage.publicUrlForKey(storageKey),
        byteSize: normalized.byteLength,
        mimeType: "image/webp",
        expiresAt: new Date(now.getTime() + PENDING_UPLOAD_LIFETIME_MS),
      },
      select: { id: true, imageUrl: true, byteSize: true, mimeType: true },
    });
  } catch (error) {
    try { await storage.deleteObject(storageKey); } catch { /* preserve the original DB failure */ }
    throw error;
  }
}
