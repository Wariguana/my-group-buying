import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { retryGroupBuyTransaction } from "@/lib/group-buys/retry";
import {
  createGroupBuyDraftSchema,
  groupBuyIdSchema,
  updateGroupBuyDraftSchema,
} from "@/lib/group-buys/validation";

export type GroupBuyErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "NOT_EDITABLE"
  | "NOT_PUBLISHABLE"
  | "PUBLISH_NO_ITEMS"
  | "PUBLISH_ORDERING_ENDED"
  | "IMAGE_NOT_FOUND"
  | "IMAGE_UPLOAD_UNAVAILABLE"
  | "FAILED";

export type GroupBuyResult<T> = { ok: true; value: T } | { ok: false; error: GroupBuyErrorCode };

// Match the SKU publication gate; legacy items and SKU offers are separate catalogues.
const availableSkuOffer = {
  isActive: true,
  sku: { isActive: true, product: { isActive: true, skuInventoryEnabled: true }, inventory: { isNot: null } },
} satisfies Prisma.GroupBuySkuWhereInput;

export const groupBuyListSelect = {
  id: true,
  title: true,
  status: true,
  startAt: true,
  endAt: true,
  publishedAt: true,
  allowsSevenEleven: true,
  _count: { select: { skuOffers: { where: availableSkuOffer } } },
} as const;

export const groupBuyDetailSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  startAt: true,
  endAt: true,
  allowsSevenEleven: true,
  _count: { select: { orders: true, qbOrders: true, skuOffers: { where: availableSkuOffer } } },
  images: {
    select: { id: true, imageUrl: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.GroupBuySelect;

export const groupBuyPublishSelect = {
  id: true,
  status: true,
  startAt: true,
  endAt: true,
  updatedAt: true,
  _count: { select: { skuOffers: { where: availableSkuOffer } } },
} satisfies Prisma.GroupBuySelect;

type GroupBuyListItem = Prisma.GroupBuyGetPayload<{ select: typeof groupBuyListSelect }>;
type GroupBuyDetail = Prisma.GroupBuyGetPayload<{ select: typeof groupBuyDetailSelect }>;

export async function listGroupBuys(): Promise<GroupBuyResult<GroupBuyListItem[]>> {
  try {
    const value = await getDb().groupBuy.findMany({
      select: groupBuyListSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return { ok: true, value };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function getGroupBuyDraftById(id: unknown): Promise<GroupBuyResult<GroupBuyDetail>> {
  const parsedId = groupBuyIdSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "NOT_FOUND" };
  try {
    const value = await getDb().groupBuy.findUnique({ where: { id: parsedId.data }, select: groupBuyDetailSelect });
    return value ? { ok: true, value } : { ok: false, error: "NOT_FOUND" };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

function createSlug() {
  return `gb-${randomBytes(12).toString("base64url")}`;
}

class GalleryWriteConflict extends Error {
  constructor(readonly code: "IMAGE_UPLOAD_UNAVAILABLE") { super(code); }
}

export async function createGroupBuyDraft(input: unknown, adminUserId?: unknown): Promise<GroupBuyResult<{ id: string }>> {
  const parsed = createGroupBuyDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };
  const pendingIds = parsed.data.gallery.filter((entry) => entry.kind === "pending").map((entry) => entry.uploadId);
  const parsedAdminId = groupBuyIdSchema.safeParse(adminUserId);
  if (pendingIds.length && !parsedAdminId.success) return { ok: false, error: "INVALID_INPUT" };
  const adminId = parsedAdminId.success ? parsedAdminId.data : null;

  try {
    return await getDb().$transaction(async (transaction) => {
      const now = new Date();
      if (parsed.data.gallery.some((entry) => entry.kind === "existing")) {
        return { ok: false as const, error: "IMAGE_NOT_FOUND" as const };
      }
      const pendingUploads = pendingIds.length ? await transaction.pendingGroupBuyImageUpload.findMany({
        where: { id: { in: pendingIds }, adminUserId: adminId!, consumedAt: null, expiresAt: { gt: now } },
        select: { id: true, imageUrl: true, storageKey: true },
      }) : [];
      if (pendingUploads.length !== pendingIds.length) return { ok: false as const, error: "IMAGE_UPLOAD_UNAVAILABLE" as const };

      if (pendingIds.length) {
        const claimed = await transaction.pendingGroupBuyImageUpload.updateMany({
          where: { id: { in: pendingIds }, adminUserId: adminId!, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now },
        });
        if (claimed.count !== pendingIds.length) throw new GalleryWriteConflict("IMAGE_UPLOAD_UNAVAILABLE");
      }
      const pendingById = new Map(pendingUploads.map((upload) => [upload.id, upload]));
      const created = await transaction.groupBuy.create({
        data: {
          title: parsed.data.title,
          slug: createSlug(),
          description: parsed.data.description,
          status: "DRAFT",
          allowsSelfPickup: false,
          startAt: parsed.data.startAt,
          endAt: parsed.data.endAt,
          allowsSevenEleven: parsed.data.allowsSevenEleven,
          images: {
            create: parsed.data.gallery.map((entry, sortOrder) => {
              const upload = pendingById.get(entry.kind === "pending" ? entry.uploadId : "")!;
              return { imageUrl: upload.imageUrl, storageKey: upload.storageKey, sortOrder };
            }),
          },
        },
        select: { id: true },
      });
      return { ok: true as const, value: created };
    });
  } catch (error) {
    if (error instanceof GalleryWriteConflict) return { ok: false, error: error.code };
    return { ok: false, error: "FAILED" };
  }
}

export async function updateGroupBuyDraft(id: unknown, input: unknown, adminUserId?: unknown): Promise<GroupBuyResult<{ id: string; removedStorageKeys?: string[] }>> {
  const parsedId = groupBuyIdSchema.safeParse(id);
  const parsedInput = updateGroupBuyDraftSchema.safeParse(input);
  if (!parsedId.success || !parsedInput.success) return { ok: false, error: "INVALID_INPUT" };
  const pendingIds = parsedInput.data.gallery.filter((entry) => entry.kind === "pending").map((entry) => entry.uploadId);
  const parsedAdminId = groupBuyIdSchema.safeParse(adminUserId);
  if (pendingIds.length && !parsedAdminId.success) return { ok: false, error: "INVALID_INPUT" };
  const adminId = parsedAdminId.success ? parsedAdminId.data : null;

  try {
    return await retryGroupBuyTransaction(() =>
      getDb().$transaction(async (transaction) => {
      const existing = await transaction.groupBuy.findUnique({
        where: { id: parsedId.data },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          _count: { select: { skuOffers: { where: availableSkuOffer } } },
          images: { select: { id: true, storageKey: true } },
        },
      });
      if (!existing) return { ok: false as const, error: "NOT_FOUND" as const };
      if (existing.status !== "DRAFT" && existing.status !== "PUBLISHED") {
        return { ok: false as const, error: "NOT_EDITABLE" as const };
      }

      const existingImageById = new Map(existing.images.map((image) => [image.id, image]));
      const desiredExistingImageIds = parsedInput.data.gallery
        .filter((entry) => entry.kind === "existing")
        .map((entry) => entry.id);
      if (desiredExistingImageIds.some((imageId) => !existingImageById.has(imageId))) {
        return { ok: false as const, error: "IMAGE_NOT_FOUND" as const };
      }
      const now = new Date();
      const pendingUploads = pendingIds.length ? await transaction.pendingGroupBuyImageUpload.findMany({
        where: { id: { in: pendingIds }, adminUserId: adminId!, consumedAt: null, expiresAt: { gt: now } },
        select: { id: true, imageUrl: true, storageKey: true },
      }) : [];
      if (pendingUploads.length !== pendingIds.length) return { ok: false as const, error: "IMAGE_UPLOAD_UNAVAILABLE" as const };
      const desiredExistingImageIdSet = new Set(desiredExistingImageIds);
      const removedImages = existing.images.filter((image) => !desiredExistingImageIdSet.has(image.id));

      if (existing.status === "PUBLISHED" && !existing._count.skuOffers) {
        return { ok: false as const, error: "PUBLISH_NO_ITEMS" as const };
      }

      // Historical item, pickup and self-pickup settings are intentionally untouched.
      const scalarUpdate = await transaction.groupBuy.updateMany({
        where: { id: existing.id, status: existing.status, updatedAt: existing.updatedAt },
        data: {
          title: parsedInput.data.title,
          description: parsedInput.data.description,
          startAt: parsedInput.data.startAt,
          endAt: parsedInput.data.endAt,
          allowsSevenEleven: parsedInput.data.allowsSevenEleven,
        },
      });
      if (scalarUpdate.count !== 1) return { ok: false as const, error: "NOT_EDITABLE" as const };

      if (pendingIds.length) {
        const claimed = await transaction.pendingGroupBuyImageUpload.updateMany({
          where: { id: { in: pendingIds }, adminUserId: adminId!, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now },
        });
        if (claimed.count !== pendingIds.length) throw new GalleryWriteConflict("IMAGE_UPLOAD_UNAVAILABLE");
      }

      if (removedImages.length) {
        await transaction.groupBuyImage.deleteMany({
          where: { groupBuyId: existing.id, id: { in: removedImages.map((image) => image.id) } },
        });
      }
      const pendingById = new Map(pendingUploads.map((upload) => [upload.id, upload]));
      for (const [sortOrder, entry] of parsedInput.data.gallery.entries()) {
        if (entry.kind === "existing") {
          await transaction.groupBuyImage.update({
            where: { id: entry.id },
            data: { sortOrder },
            select: { id: true },
          });
        } else {
          const upload = pendingById.get(entry.uploadId)!;
          await transaction.groupBuyImage.create({
            data: { groupBuyId: existing.id, imageUrl: upload.imageUrl, storageKey: upload.storageKey, sortOrder },
            select: { id: true },
          });
        }
      }

      const removedStorageKeys = removedImages.flatMap((image) => image.storageKey ? [image.storageKey] : []);
      return { ok: true as const, value: removedStorageKeys.length ? { id: existing.id, removedStorageKeys } : { id: existing.id } };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    );
  } catch (error) {
    if (error instanceof GalleryWriteConflict) return { ok: false, error: error.code };
    return { ok: false, error: "FAILED" };
  }
}

export async function publishGroupBuy(id: unknown, now: Date = new Date()): Promise<GroupBuyResult<{ id: string }>> {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return { ok: false, error: "INVALID_INPUT" };

  try {
    return await getDb().$transaction(async (transaction) => {
      const parsedId = groupBuyIdSchema.safeParse(id);
      if (!parsedId.success) return { ok: false as const, error: "INVALID_INPUT" as const };

      const existing = await transaction.groupBuy.findUnique({
        where: { id: parsedId.data },
        select: groupBuyPublishSelect,
      });
      if (!existing) return { ok: false as const, error: "NOT_FOUND" as const };
      if (existing.status !== "DRAFT") return { ok: false as const, error: "NOT_PUBLISHABLE" as const };
      if (!existing._count.skuOffers) return { ok: false as const, error: "PUBLISH_NO_ITEMS" as const };
      if (existing.endAt <= now) return { ok: false as const, error: "PUBLISH_ORDERING_ENDED" as const };

      const transition = await transaction.groupBuy.updateMany({
        where: { id: existing.id, status: "DRAFT", updatedAt: existing.updatedAt },
        data: { status: "PUBLISHED", publishedAt: now },
      });
      if (transition.count !== 1) return { ok: false as const, error: "NOT_PUBLISHABLE" as const };

      return { ok: true as const, value: { id: existing.id } };
    });
  } catch {
    return { ok: false, error: "FAILED" };
  }
}
