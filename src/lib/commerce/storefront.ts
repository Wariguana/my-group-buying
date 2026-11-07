import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";

export const storefrontPageSize = 24;
type StorefrontCard = {
  id: string; title: string; slug: string; description: string | null; startAt: Date; endAt: Date;
  category: string | null; image: string | null; isFeatured: boolean; featuredSort: number;
  minPrice: number | null; priceVaries: boolean; soldOut: boolean; purchasable: boolean;
};

// Shared by eligibility and card aggregates. Never use legacy stock or load option trees.
const activeOffers = Prisma.sql`FROM "GroupBuySku" o
  JOIN "ProductSku" s ON s.id = o."skuId" AND s."isActive"
  JOIN "Product" p ON p.id = s."productId" AND p."isActive"
  LEFT JOIN "SkuInventory" i ON i."skuId" = s.id
  WHERE o."groupBuyId" = g.id AND o."isActive"`;
const stocked = Prisma.sql`p."skuInventoryEnabled" AND i."skuId" IS NOT NULL
  AND i."onHand" - i.reserved - i.allocated > 0`;

export async function listStorefront(query: { q?: string; category?: string; view?: string; page?: string }) {
  const db = getDb(), now = new Date();
  const q = query.q?.trim().slice(0, 120);
  const featured = Prisma.sql`g."isFeatured" AND g."startAt" <= ${now} AND g."endAt" > ${now}
    AND EXISTS (SELECT 1 ${activeOffers} AND ${stocked})`;
  const where = Prisma.sql`g.status = 'PUBLISHED' AND NOT g."isArchived"
    AND ${query.view === "ended" ? Prisma.sql`g."endAt" <= ${now}` : Prisma.sql`g."endAt" > ${now}`}
    ${query.category ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Category" c WHERE c.id = g."categoryId" AND c.id::text = ${query.category} AND c."isActive")` : Prisma.empty}
    ${q ? Prisma.sql`AND (g.title ILIKE ${`%${q}%`} OR EXISTS (SELECT 1 ${activeOffers} AND p.name ILIKE ${`%${q}%`}))` : Prisma.empty}
    ${query.view === "featured" ? Prisma.sql`AND ${featured}` : Prisma.empty}`;
  const [categories, counts] = await Promise.all([
    db.category.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.$queryRaw<{ count: number }[]>(Prisma.sql`SELECT count(*)::int AS count FROM "GroupBuy" g WHERE ${where}`),
  ]);
  const count = counts[0].count, totalPages = Math.max(1, Math.ceil(count / storefrontPageSize));
  const requestedPage = Number(query.page ?? 1);
  const page = Math.min(totalPages, Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
  const readCards = (filter: Prisma.Sql, order: Prisma.Sql, limit: number, offset = 0) => db.$queryRaw<StorefrontCard[]>(Prisma.sql`
    WITH page AS (SELECT g.* FROM "GroupBuy" g WHERE ${filter} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset})
    SELECT g.id, g.title, g.slug, g.description, g."startAt", g."endAt", g."isFeatured", g."featuredSort",
      c.name AS category,
      (SELECT image."imageUrl" FROM "GroupBuyImage" image WHERE image."groupBuyId" = g.id ORDER BY image."sortOrder", image.id LIMIT 1) AS image,
      a."minPrice", COALESCE(a."minPrice" <> a."maxPrice", false) AS "priceVaries",
      COALESCE(a."soldOut", false) AS "soldOut",
      (g."startAt" <= ${now} AND g."endAt" > ${now} AND COALESCE(a.stocked, false)) AS purchasable
    FROM page g LEFT JOIN "Category" c ON c.id = g."categoryId"
    CROSS JOIN LATERAL (SELECT min(o."salePrice") AS "minPrice", max(o."salePrice") AS "maxPrice",
      bool_and(p."skuInventoryEnabled" AND i."skuId" IS NOT NULL AND COALESCE(i."onHand" - i.reserved - i.allocated <= 0, false)) AS "soldOut",
      bool_or(${stocked}) AS stocked ${activeOffers}) a
    ORDER BY ${order}`);
  const featuredOrder = Prisma.sql`g."featuredSort" ASC, g.id ASC`;
  const [cards, preview] = await Promise.all([
    readCards(where, query.view === "featured" ? featuredOrder : Prisma.sql`g."publishedAt" DESC, g.id DESC`, storefrontPageSize, (page - 1) * storefrontPageSize),
    readCards(Prisma.sql`${where} AND ${featured}`, featuredOrder, 7),
  ]);
  return { categories, cards, featured: preview.slice(0, 6), extraFeatured: preview.length > 6, count, page, totalPages };
}
