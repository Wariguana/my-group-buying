import "server-only";

import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
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
  | "PUBLISH_ITEM_UNAVAILABLE"
  | "PUBLISH_NO_PICKUPS"
  | "PUBLISH_PICKUP_UNAVAILABLE"
  | "PUBLISH_ORDERING_ENDED"
  | "PUBLISH_PICKUP_BEFORE_ORDER_END"
  | "PRODUCT_UNAVAILABLE"
  | "PICKUP_LOCATION_UNAVAILABLE"
  | "FAILED";

export type GroupBuyResult<T> = { ok: true; value: T } | { ok: false; error: GroupBuyErrorCode };

export const groupBuyListSelect = {
  id: true,
  title: true,
  status: true,
  startAt: true,
  endAt: true,
  publishedAt: true,
  _count: { select: { items: true, pickups: true } },
} as const;

export const groupBuyDetailSelect = {
  id: true,
  title: true,
  description: true,
  coverImageUrl: true,
  status: true,
  startAt: true,
  endAt: true,
  items: {
    select: {
      id: true,
      productId: true,
      salePrice: true,
      cost: true,
      stock: true,
      purchaseLimit: true,
      sortOrder: true,
      isActive: true,
      product: { select: { name: true, unit: true, isActive: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  },
  pickups: {
    select: {
      id: true,
      pickupLocationId: true,
      pickupStartAt: true,
      pickupEndAt: true,
      sortOrder: true,
      pickupLocation: { select: { name: true, address: true, isActive: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.GroupBuySelect;

export const groupBuyProductOptionSelect = {
  id: true,
  name: true,
  unit: true,
  defaultPrice: true,
  cost: true,
  isActive: true,
} as const;

export const groupBuyPickupOptionSelect = {
  id: true,
  name: true,
  address: true,
  isActive: true,
} as const;

export const groupBuyPublishSelect = {
  id: true,
  status: true,
  startAt: true,
  endAt: true,
  updatedAt: true,
  items: {
    select: {
      id: true,
      isActive: true,
      product: { select: { id: true, isActive: true } },
    },
  },
  pickups: {
    select: {
      id: true,
      pickupStartAt: true,
      pickupEndAt: true,
      pickupLocation: { select: { id: true, isActive: true } },
    },
  },
} satisfies Prisma.GroupBuySelect;

type GroupBuyListItem = Prisma.GroupBuyGetPayload<{ select: typeof groupBuyListSelect }>;
type GroupBuyDetail = Prisma.GroupBuyGetPayload<{ select: typeof groupBuyDetailSelect }>;
type GroupBuyProductOption = Prisma.ProductGetPayload<{ select: typeof groupBuyProductOptionSelect }>;
type GroupBuyPickupOption = Prisma.PickupLocationGetPayload<{ select: typeof groupBuyPickupOptionSelect }>;

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

function parseCurrentIds(value: unknown): string[] | null {
  const parsed = groupBuyIdSchema.array().safeParse(value ?? []);
  return parsed.success ? [...new Set(parsed.data)] : null;
}

export async function listGroupBuyProductOptions(currentProductIds: unknown = []): Promise<GroupBuyResult<GroupBuyProductOption[]>> {
  const ids = parseCurrentIds(currentProductIds);
  if (!ids) return { ok: false, error: "INVALID_INPUT" };
  try {
    const value = await getDb().product.findMany({
      where: ids.length ? { OR: [{ isActive: true }, { id: { in: ids } }] } : { isActive: true },
      select: groupBuyProductOptionSelect,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return { ok: true, value };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function listGroupBuyPickupLocationOptions(currentPickupLocationIds: unknown = []): Promise<GroupBuyResult<GroupBuyPickupOption[]>> {
  const ids = parseCurrentIds(currentPickupLocationIds);
  if (!ids) return { ok: false, error: "INVALID_INPUT" };
  try {
    const value = await getDb().pickupLocation.findMany({
      where: ids.length ? { OR: [{ isActive: true }, { id: { in: ids } }] } : { isActive: true },
      select: groupBuyPickupOptionSelect,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return { ok: true, value };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

function createSlug() {
  return `gb-${randomBytes(12).toString("base64url")}`;
}

export async function createGroupBuyDraft(input: unknown): Promise<GroupBuyResult<{ id: string }>> {
  const parsed = createGroupBuyDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  try {
    return await getDb().$transaction(async (transaction) => {
      const productIds = parsed.data.items.map((item) => item.productId);
      const pickupIds = parsed.data.pickups.map((pickup) => pickup.pickupLocationId);
      const products = productIds.length ? await transaction.product.findMany({
        where: { id: { in: productIds }, isActive: true },
        select: { id: true, defaultPrice: true, cost: true },
      }) : [];
      if (products.length !== productIds.length) return { ok: false as const, error: "PRODUCT_UNAVAILABLE" as const };
      const pickupLocations = pickupIds.length ? await transaction.pickupLocation.findMany({
        where: { id: { in: pickupIds }, isActive: true },
        select: { id: true },
      }) : [];
      if (pickupLocations.length !== pickupIds.length) return { ok: false as const, error: "PICKUP_LOCATION_UNAVAILABLE" as const };

      const productById = new Map(products.map((product) => [product.id, product]));
      const created = await transaction.groupBuy.create({
        data: {
          title: parsed.data.title,
          slug: createSlug(),
          description: parsed.data.description,
          coverImageUrl: parsed.data.coverImageUrl,
          status: "DRAFT",
          startAt: parsed.data.startAt,
          endAt: parsed.data.endAt,
          items: {
            create: parsed.data.items.map((item, sortOrder) => {
              const product = productById.get(item.productId)!;
              return {
                productId: item.productId,
                salePrice: item.salePrice ?? product.defaultPrice,
                cost: product.cost,
                stock: item.stock,
                purchaseLimit: item.purchaseLimit,
                sortOrder,
              };
            }),
          },
          pickups: {
            create: parsed.data.pickups.map((pickup, sortOrder) => ({ ...pickup, sortOrder })),
          },
        },
        select: { id: true },
      });
      return { ok: true as const, value: created };
    });
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function updateGroupBuyDraft(id: unknown, input: unknown): Promise<GroupBuyResult<{ id: string }>> {
  const parsedId = groupBuyIdSchema.safeParse(id);
  const parsedInput = updateGroupBuyDraftSchema.safeParse(input);
  if (!parsedId.success || !parsedInput.success) return { ok: false, error: "INVALID_INPUT" };

  try {
    return await getDb().$transaction(async (transaction) => {
      const existing = await transaction.groupBuy.findUnique({
        where: { id: parsedId.data },
        select: {
          id: true,
          status: true,
          items: { select: { id: true, productId: true, salePrice: true, cost: true } },
          pickups: { select: { id: true, pickupLocationId: true } },
        },
      });
      if (!existing) return { ok: false as const, error: "NOT_FOUND" as const };
      if (existing.status !== "DRAFT") return { ok: false as const, error: "NOT_EDITABLE" as const };

      const existingItemByProduct = new Map(existing.items.map((item) => [item.productId, item]));
      const existingPickupByLocation = new Map(existing.pickups.map((pickup) => [pickup.pickupLocationId, pickup]));
      if (parsedInput.data.items.some((item) => existingItemByProduct.has(item.productId) && item.salePrice === null)) {
        return { ok: false as const, error: "INVALID_INPUT" as const };
      }
      const newProductIds = parsedInput.data.items.map((item) => item.productId).filter((productId) => !existingItemByProduct.has(productId));
      const newPickupIds = parsedInput.data.pickups.map((pickup) => pickup.pickupLocationId).filter((pickupId) => !existingPickupByLocation.has(pickupId));

      const newProducts = newProductIds.length ? await transaction.product.findMany({
        where: { id: { in: newProductIds }, isActive: true },
        select: { id: true, defaultPrice: true, cost: true },
      }) : [];
      if (newProducts.length !== newProductIds.length) return { ok: false as const, error: "PRODUCT_UNAVAILABLE" as const };
      const newPickupLocations = newPickupIds.length ? await transaction.pickupLocation.findMany({
        where: { id: { in: newPickupIds }, isActive: true },
        select: { id: true },
      }) : [];
      if (newPickupLocations.length !== newPickupIds.length) return { ok: false as const, error: "PICKUP_LOCATION_UNAVAILABLE" as const };

      const scalarUpdate = await transaction.groupBuy.updateMany({
        where: { id: existing.id, status: "DRAFT" },
        data: {
          title: parsedInput.data.title,
          description: parsedInput.data.description,
          coverImageUrl: parsedInput.data.coverImageUrl,
          startAt: parsedInput.data.startAt,
          endAt: parsedInput.data.endAt,
        },
      });
      if (scalarUpdate.count !== 1) return { ok: false as const, error: "NOT_EDITABLE" as const };

      const desiredProductIds = new Set(parsedInput.data.items.map((item) => item.productId));
      const removedItemIds = existing.items.filter((item) => !desiredProductIds.has(item.productId)).map((item) => item.id);
      if (removedItemIds.length) await transaction.groupBuyItem.deleteMany({ where: { groupBuyId: existing.id, id: { in: removedItemIds } } });

      const newProductById = new Map(newProducts.map((product) => [product.id, product]));
      for (const [sortOrder, item] of parsedInput.data.items.entries()) {
        const current = existingItemByProduct.get(item.productId);
        if (current) {
          await transaction.groupBuyItem.update({
            where: { id: current.id },
            data: { salePrice: item.salePrice!, stock: item.stock, purchaseLimit: item.purchaseLimit, sortOrder },
            select: { id: true },
          });
        } else {
          const product = newProductById.get(item.productId)!;
          await transaction.groupBuyItem.create({
            data: {
              groupBuyId: existing.id,
              productId: item.productId,
              salePrice: item.salePrice ?? product.defaultPrice,
              cost: product.cost,
              stock: item.stock,
              purchaseLimit: item.purchaseLimit,
              sortOrder,
            },
            select: { id: true },
          });
        }
      }

      const desiredPickupIds = new Set(parsedInput.data.pickups.map((pickup) => pickup.pickupLocationId));
      const removedPickupIds = existing.pickups.filter((pickup) => !desiredPickupIds.has(pickup.pickupLocationId)).map((pickup) => pickup.id);
      if (removedPickupIds.length) await transaction.groupBuyPickup.deleteMany({ where: { groupBuyId: existing.id, id: { in: removedPickupIds } } });

      for (const [sortOrder, pickup] of parsedInput.data.pickups.entries()) {
        const current = existingPickupByLocation.get(pickup.pickupLocationId);
        if (current) {
          await transaction.groupBuyPickup.update({
            where: { id: current.id },
            data: { pickupStartAt: pickup.pickupStartAt, pickupEndAt: pickup.pickupEndAt, sortOrder },
            select: { id: true },
          });
        } else {
          await transaction.groupBuyPickup.create({
            data: { groupBuyId: existing.id, ...pickup, sortOrder },
            select: { id: true },
          });
        }
      }

      return { ok: true as const, value: { id: existing.id } };
    });
  } catch {
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
      if (existing.items.length === 0) return { ok: false as const, error: "PUBLISH_NO_ITEMS" as const };
      if (existing.items.some((item) => !item.isActive || !item.product?.isActive)) {
        return { ok: false as const, error: "PUBLISH_ITEM_UNAVAILABLE" as const };
      }
      if (existing.pickups.length === 0) return { ok: false as const, error: "PUBLISH_NO_PICKUPS" as const };
      if (existing.pickups.some((pickup) => !pickup.pickupLocation?.isActive)) {
        return { ok: false as const, error: "PUBLISH_PICKUP_UNAVAILABLE" as const };
      }
      if (existing.endAt <= now) return { ok: false as const, error: "PUBLISH_ORDERING_ENDED" as const };
      if (existing.pickups.some((pickup) => pickup.pickupStartAt !== null && pickup.pickupStartAt < existing.endAt)) {
        return { ok: false as const, error: "PUBLISH_PICKUP_BEFORE_ORDER_END" as const };
      }

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
