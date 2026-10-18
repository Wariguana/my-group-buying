import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { cartSchema } from "./validation";

// Explicit allowlist: costs, supplier, ledger and administrator data never leave the server.
export const offerSelect = {
  id: true, salePrice: true, purchaseLimit: true, isActive: true,
  groupBuy: { select: { slug: true, title: true, status: true, isArchived: true, startAt: true, endAt: true, allowsCombinedShipping: true } },
  sku: { select: { id: true, code: true, displayName: true, isActive: true, temperature: true, shippingMethods: true,
    weightGrams: true, lengthMm: true, widthMm: true, heightMm: true, shippingNote: true,
    product: { select: { name: true, isActive: true, skuInventoryEnabled: true } },
    options: { select: { optionValue: { select: { value: true, option: { select: { name: true } } } } } },
    inventory: { select: { onHand: true, reserved: true, allocated: true } } } },
} satisfies Prisma.GroupBuySkuSelect;
type Offer = Prisma.GroupBuySkuGetPayload<{ select: typeof offerSelect }>;
export function availableStock(offer: Offer) {
  const i = offer.sku.inventory;
  return offer.sku.product.skuInventoryEnabled && i ? i.onHand - i.reserved - i.allocated : 0;
}
export function offerStatus(offer: Offer, now = new Date()): string | null {
  const g = offer.groupBuy;
  if (g.status !== "PUBLISHED" || g.isArchived) return "已下架";
  if (g.endAt <= now) return "已截止";
  if (g.startAt > now) return "尚未開始";
  if (!offer.isActive || !offer.sku.isActive || !offer.sku.product.isActive) return "已停售";
  if (!offer.sku.product.skuInventoryEnabled || !offer.sku.inventory) return "庫存待盤點";
  if (availableStock(offer) <= 0) return "已售完";
  return null;
}
export function offerLabel(offer: Offer) {
  return [offer.sku.product.name, offer.sku.displayName,
    offer.sku.options.map((o) => `${o.optionValue.option.name}：${o.optionValue.value}`).join("／") || offer.sku.code].filter(Boolean).join(" · ");
}

export async function publicOffers(slug: string) {
  const rows = await getDb().groupBuySku.findMany({ where: { groupBuy: { slug, status: "PUBLISHED", isArchived: false }, isActive: true, sku: { isActive: true, product: { isActive: true } } }, select: offerSelect, orderBy: { createdAt: "asc" } });
  return rows.map((o) => ({ id: o.id, label: offerLabel(o), salePrice: o.salePrice, purchaseLimit: o.purchaseLimit, available: availableStock(o), status: offerStatus(o),
    temperature: o.sku.temperature, shippingMethods: o.sku.shippingMethods, shippingNote: o.sku.shippingNote }));
}

export async function validateCart(input: unknown) {
  const lines = cartSchema.parse(input);
  return getDb().$transaction(async (tx) => {
    const rows = await tx.groupBuySku.findMany({ where: { id: { in: lines.map((l) => l.offerId) } }, select: offerSelect });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const demand = new Map<string, number>();
    for (const line of lines) {
      const o = byId.get(line.offerId);
      if (o && !offerStatus(o) && line.expectedPrice === o.salePrice && (!o.purchaseLimit || line.quantity <= o.purchaseLimit)) demand.set(o.sku.id, (demand.get(o.sku.id) ?? 0) + line.quantity);
    }
    const now = new Date();
    const items = lines.map((line) => {
      const o = byId.get(line.offerId);
      const visible = o?.groupBuy.status === "PUBLISHED" && !o.groupBuy.isArchived;
      let status = o ? offerStatus(o, now) : "商品已不存在";
      if (o && !status && o.purchaseLimit !== null && line.quantity > o.purchaseLimit) status = "超過購買數量限制";
      if (o && !status && line.expectedPrice !== o.salePrice) status = "價格已變動";
      if (o && !status && (demand.get(o.sku.id) ?? 0) > availableStock(o)) status = "庫存不足（含跨團同 SKU 合計）";
      return { ...line, label: visible && o ? offerLabel(o) : "無法購買的商品", groupTitle: visible ? o!.groupBuy.title : "已下架", slug: visible ? o!.groupBuy.slug : null,
        currentPrice: visible ? o!.salePrice : null, available: visible ? availableStock(o!) : 0, status,
        subtotal: !status && o ? o.salePrice * line.quantity : 0,
        shipping: visible ? { allowsCombinedShipping: o!.groupBuy.allowsCombinedShipping, temperature: o!.sku.temperature, methods: o!.sku.shippingMethods,
          weightGrams: o!.sku.weightGrams, lengthMm: o!.sku.lengthMm, widthMm: o!.sku.widthMm, heightMm: o!.sku.heightMm, note: o!.sku.shippingNote } : null };
    });
    return { items, total: items.reduce((sum, item) => sum + item.subtotal, 0) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function listStorefront(query: { q?: string; category?: string; view?: string }) {
  const now = new Date();
  const q = query.q?.trim().slice(0, 120);
  const where: Prisma.GroupBuyWhereInput = { status: "PUBLISHED", isArchived: false,
    ...(query.category ? { category: { id: query.category, isActive: true } } : {}),
    ...(q ? { OR: [
      { title: { contains: q, mode: "insensitive" } },
      { skuOffers: { some: { isActive: true, sku: { isActive: true, product: { isActive: true, name: { contains: q, mode: "insensitive" } } } } } },
      { items: { some: { isActive: true, product: { isActive: true, skuInventoryEnabled: false, name: { contains: q, mode: "insensitive" } } } } },
    ] } : {}),
    ...(query.view === "ended" ? { endAt: { lte: now } } : { endAt: { gt: now } }),
    ...(query.view === "featured" ? { isFeatured: true, startAt: { lte: now } } : {}),
  };
  const [categories, groups] = await Promise.all([
    getDb().category.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    getDb().groupBuy.findMany({ where, select: { id: true, title: true, slug: true, description: true, startAt: true, endAt: true, isFeatured: true, featuredSort: true,
      category: { select: { name: true } }, images: { select: { imageUrl: true }, orderBy: { sortOrder: "asc" }, take: 1 },
      skuOffers: { where: { isActive: true, sku: { isActive: true, product: { isActive: true } } }, select: offerSelect } }, orderBy: [{ publishedAt: "desc" }, { id: "desc" }] }),
  ]);
  const cards = groups.map((g) => ({ id: g.id, title: g.title, slug: g.slug, description: g.description, startAt: g.startAt, endAt: g.endAt,
    category: g.category?.name, image: g.images[0]?.imageUrl ?? null, isFeatured: g.isFeatured, featuredSort: g.featuredSort,
    soldOut: g.skuOffers.length > 0 && g.skuOffers.every((o) => o.sku.product.skuInventoryEnabled && o.sku.inventory && availableStock(o) <= 0),
    purchasable: g.skuOffers.some((o) => !offerStatus(o, now)) }));
  const featured = cards.filter((g) => g.isFeatured && g.purchasable).sort((a, b) => a.featuredSort - b.featuredSort || a.id.localeCompare(b.id));
  return { categories, cards: query.view === "featured" ? featured : cards, featured: featured.slice(0, 6), extraFeatured: featured.length > 6 };
}
