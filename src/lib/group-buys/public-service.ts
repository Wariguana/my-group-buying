import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  getPublicGroupBuyLifecycle,
  publicGroupBuySlugSchema,
  type PublicGroupBuyLifecycle,
} from "@/lib/group-buys/public";

type PublicGroupBuyResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: "NOT_FOUND" | "FAILED" };

export const publicGroupBuyListSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  coverImageUrl: true,
  startAt: true,
  endAt: true,
} satisfies Prisma.GroupBuySelect;

export const publicGroupBuyDetailSelect = {
  slug: true,
  title: true,
  description: true,
  coverImageUrl: true,
  startAt: true,
  endAt: true,
  items: {
    where: {
      isActive: true,
      product: { isActive: true },
    },
    select: {
      salePrice: true,
      stock: true,
      purchaseLimit: true,
      sortOrder: true,
      product: { select: { name: true, unit: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  },
  pickups: {
    where: { pickupLocation: { isActive: true } },
    select: {
      pickupStartAt: true,
      pickupEndAt: true,
      sortOrder: true,
      pickupLocation: { select: { name: true, address: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.GroupBuySelect;

type PublicGroupBuyListRow = Prisma.GroupBuyGetPayload<{
  select: typeof publicGroupBuyListSelect;
}>;
type PublicGroupBuyDetailRow = Prisma.GroupBuyGetPayload<{
  select: typeof publicGroupBuyDetailSelect;
}>;

export type PublicGroupBuyListItem = PublicGroupBuyListRow & {
  lifecycle: PublicGroupBuyLifecycle;
};
export type PublicGroupBuyDetail = PublicGroupBuyDetailRow & {
  lifecycle: PublicGroupBuyLifecycle;
};

const lifecycleOrder: Record<PublicGroupBuyLifecycle, number> = {
  active: 0,
  scheduled: 1,
  ended: 2,
};

function isValidNow(now: Date): boolean {
  return now instanceof Date && !Number.isNaN(now.getTime());
}

export async function listPublicGroupBuys(
  now: Date = new Date(),
): Promise<PublicGroupBuyResult<PublicGroupBuyListItem[]>> {
  if (!isValidNow(now)) return { ok: false, error: "FAILED" };

  try {
    const rows = await getDb().groupBuy.findMany({
      where: { status: "PUBLISHED" },
      select: publicGroupBuyListSelect,
      orderBy: [{ startAt: "desc" }, { id: "desc" }],
    });
    const value = rows.map((groupBuy) => ({
      ...groupBuy,
      lifecycle: getPublicGroupBuyLifecycle(groupBuy.startAt, groupBuy.endAt, now),
    }));
    value.sort((left, right) => lifecycleOrder[left.lifecycle] - lifecycleOrder[right.lifecycle]);
    return { ok: true, value };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function getPublicGroupBuyBySlug(
  slug: unknown,
  now: Date = new Date(),
): Promise<PublicGroupBuyResult<PublicGroupBuyDetail>> {
  const parsedSlug = publicGroupBuySlugSchema.safeParse(slug);
  if (!parsedSlug.success || !isValidNow(now)) return { ok: false, error: "NOT_FOUND" };

  try {
    const groupBuy = await getDb().groupBuy.findFirst({
      where: { slug: parsedSlug.data, status: "PUBLISHED" },
      select: publicGroupBuyDetailSelect,
    });
    if (!groupBuy) return { ok: false, error: "NOT_FOUND" };
    return {
      ok: true,
      value: {
        ...groupBuy,
        lifecycle: getPublicGroupBuyLifecycle(groupBuy.startAt, groupBuy.endAt, now),
      },
    };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}
