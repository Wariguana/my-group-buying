import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { getTaipeiCalendarDayBounds } from "@/lib/group-buys/time";
import { lifecycleInclude } from "@/lib/qbuy/queries";

export const purchaseStates: Record<string, string> = { AWAITING_PAYMENT: "尚未付款", REPORTED: "顧客已回報，待確認入帳", ANOMALY: "付款異常", RECEIVED: "已確認收款，待建立正式訂單", FINALIZED: "已建立正式訂單", EXPIRED: "付款回報已逾期", REFUND_REQUIRED: "無法履約，需處理退款" };
export const orderStates: Record<string, string> = { PAID: "已付款，待履約", COMPLETED: "已完成", CANCELLED: "已取消（退款另列）" };
export const workQueues: Record<string, string> = { all: "全部工作", cancel: "取消申請待審核", refund: "待處理退款", refundError: "退款異常", shipment: "待建立物流", shippingError: "出貨及退回異常", returned: "退回待處理", overdue: "退回逾期 7 天", fee: "重寄待收運費", notifications: "通知異常" };
type RawParams = Record<string, string | string[] | undefined>;
const single = (value: string | string[] | undefined) => typeof value === "string" ? value : "";
export function parseOrderFilters(raw: RawParams) {
  const view = single(raw.view) === "orders" ? "orders" as const : "purchases" as const;
  const states = view === "orders" ? orderStates : purchaseStates;
  const status = single(raw.status);
  const queue = single(raw.queue);
  return { view, q: single(raw.q).trim().slice(0, 100), page: Math.max(1, Math.min(10000, Math.floor(Number(single(raw.page)) || 1))), status: Object.hasOwn(states, status) ? status : "", queue: Object.hasOwn(workQueues, queue) ? queue : "all", today: single(raw.today) === "1" };
}
export type OrderFilters = ReturnType<typeof parseOrderFilters>;
export function orderListUrl(f: OrderFilters, patch: Partial<OrderFilters> = {}) {
  const value = { ...f, ...patch };
  const p = new URLSearchParams({ view: value.view });
  if (value.q) p.set("q", value.q);
  if (value.status) p.set("status", value.status);
  if (value.queue !== "all" && value.view === "purchases") p.set("queue", value.queue);
  if (value.today) p.set("today", "1");
  if (value.page > 1) p.set("page", String(value.page));
  return `/admin/qbuy?${p}`;
}

// Correlate BOTH checkout and group buy; another group's paid order is not enough.
const pendingGroup = Prisma.sql`
  EXISTS (SELECT 1 FROM "CheckoutItem" i JOIN "QbOrder" o
    ON o."checkoutId" = i."checkoutId" AND o."groupBuyId" = i."groupBuyId"
    WHERE i."fulfillmentGroupId" = g.id AND o.status = 'PAID')
  AND NOT EXISTS (SELECT 1 FROM "QbShipment" s
    WHERE s."fulfillmentGroupId" = g.id AND s.status NOT IN ('VOIDED','RETURNED'))`;

export async function pendingDeliveryWork(checkoutId?: string) {
  const [counts] = await getDb().$queryRaw<{ groups: number; purchases: number }[]>(Prisma.sql`
    SELECT count(*)::int AS groups, count(DISTINCT g."checkoutId")::int AS purchases
    FROM "FulfillmentGroup" g JOIN "Checkout" c ON c.id = g."checkoutId"
    WHERE c.status = 'FINALIZED' AND ${pendingGroup}
      ${checkoutId ? Prisma.sql`AND c.id = ${checkoutId}::uuid` : Prisma.empty}`);
  return counts;
}

// Only page IDs cross the application boundary, never the full matching set.
async function sqlPage(from: Prisma.Sql, where: Prisma.Sql, alias: Prisma.Sql, requestedPage: number) {
  const db = getDb();
  const [total] = await db.$queryRaw<{ count: number }[]>(Prisma.sql`SELECT count(*)::int AS count FROM ${from} WHERE ${where}`);
  const count = total.count;
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(count / 20)));
  const ids = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT ${alias}.id FROM ${from} WHERE ${where}
    ORDER BY ${alias}."createdAt" DESC, ${alias}.id DESC LIMIT 20 OFFSET ${(page - 1) * 20}`);
  return { count, page, ids: ids.map(row => row.id) };
}

async function pendingPurchasePage(f: OrderFilters, start: Date, end: Date) {
  const pattern = "%" + f.q + "%";
  return sqlPage(Prisma.sql`"Checkout" c`, Prisma.sql`
    c.status = 'FINALIZED'
    AND EXISTS (SELECT 1 FROM "FulfillmentGroup" g WHERE g."checkoutId" = c.id AND ${pendingGroup})
    ${f.status ? Prisma.sql`AND c.status = ${f.status}` : Prisma.empty}
    ${f.today ? Prisma.sql`AND c."createdAt" >= ${start} AND c."createdAt" < ${end}` : Prisma.empty}
    ${f.q ? Prisma.sql`AND (c."customerName" ILIKE ${pattern} OR c."customerPhone" LIKE ${pattern}
      OR EXISTS (SELECT 1 FROM "QbOrder" o WHERE o."checkoutId" = c.id AND o."orderNumber" ILIKE ${pattern})
      OR EXISTS (SELECT 1 FROM "CheckoutItem" i WHERE i."checkoutId" = c.id
        AND (i."productName" ILIKE ${pattern} OR i."groupTitle" ILIKE ${pattern}))
      ${z.uuid().safeParse(f.q).success ? Prisma.sql`OR c.id = ${f.q}::uuid` : Prisma.empty})` : Prisma.empty}
  `, Prisma.sql`c`, f.page);
}
export async function purchaseQueueFilter(queue: string, now = new Date()): Promise<Prisma.CheckoutWhereInput> {
  const filters: Record<string, Prisma.CheckoutWhereInput> = {
    cancel: { cancellations: { some: { status: { in: ["PENDING", "REVIEW_REQUIRED"] } } } },
    refund: { refunds: { some: { status: { in: ["PENDING", "PROCESSING"] } } } },
    refundError: { refunds: { some: { status: "ERROR" } } },
    returned: { returns: { some: { status: { not: "RESENT" } } } },
    overdue: { returns: { some: { deadline: { lt: now }, status: { not: "RESENT" } } } },
    fee: { returns: { some: { status: "AWAITING_FEE" } } },
    notifications: { outbox: { some: { audience: { not: "LEGACY" }, status: { in: ["FAILED", "BLOCKED", "RETRY"] } } } },
  };
  if (queue === "shippingError") return { qbShipments: { some: {
    status: { in: ["RETURNED", "VOIDED"] },
    group: { qbShipments: { none: { status: { notIn: ["RETURNED", "VOIDED"] } } } },
  } } };
  // This queue needs cross-table column correlation and is paginated in SQL below.
  if (queue === "shipment") throw new Error("Use the pending shipment list query");
  return filters[queue] ?? {};
}
export async function listPurchases(f: OrderFilters) {
  const { start, end } = getTaipeiCalendarDayBounds(new Date());
  const pending = f.queue === "shipment" ? await pendingPurchasePage(f, start, end) : null;
  const where: Prisma.CheckoutWhereInput = pending ? { id: { in: pending.ids } } : { AND: [await purchaseQueueFilter(f.queue), f.status ? { status: f.status } : {}, f.today ? { createdAt: { gte: start, lt: end } } : {}, f.q ? { OR: [
    { customerName: { contains: f.q, mode: "insensitive" } }, { customerPhone: { contains: f.q } },
    { orders: { some: { orderNumber: { contains: f.q, mode: "insensitive" } } } },
    { items: { some: { OR: [{ productName: { contains: f.q, mode: "insensitive" } }, { groupTitle: { contains: f.q, mode: "insensitive" } }] } } },
    ...(z.uuid().safeParse(f.q).success ? [{ id: f.q }] : []),
  ] } : {}] };
  const count = pending ? pending.count : await getDb().checkout.count({ where });
  const page = Math.min(f.page, Math.max(1, Math.ceil(count / 20)));
  const rows = await getDb().checkout.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, skip: pending ? 0 : (page - 1) * 20, include: { items: true, orders: true, fulfillmentGroups: true, payment: { select: { confirmedAmount: true } }, cancellations: { select: { status: true } }, refunds: { select: { status: true } }, qbShipments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { status: true, fulfillmentGroupId: true, previousShipmentId: true } } } });
  return { rows, count, page };
}
export async function listOrders(f: OrderFilters) {
  const { start, end } = getTaipeiCalendarDayBounds(new Date());
  const pattern = "%" + f.q + "%";
  const matching = f.q ? await sqlPage(Prisma.sql`"QbOrder" o`, Prisma.sql`
    TRUE ${f.status ? Prisma.sql`AND o.status = ${f.status}` : Prisma.empty}
    ${f.today ? Prisma.sql`AND o."createdAt" >= ${start} AND o."createdAt" < ${end}` : Prisma.empty}
    ${f.q ? Prisma.sql`AND (o."orderNumber" ILIKE ${pattern}
      OR EXISTS (SELECT 1 FROM "GroupBuy" g WHERE g.id = o."groupBuyId" AND g.title ILIKE ${pattern})
      OR EXISTS (SELECT 1 FROM "Checkout" c WHERE c.id = o."checkoutId"
        AND (c."customerName" ILIKE ${pattern} OR c."customerPhone" LIKE ${pattern}))
      OR EXISTS (SELECT 1 FROM "CheckoutItem" i WHERE i."checkoutId" = o."checkoutId"
        AND i."groupBuyId" = o."groupBuyId" AND i."productName" ILIKE ${pattern}))` : Prisma.empty}
  `, Prisma.sql`o`, f.page) : null;
  const where: Prisma.QbOrderWhereInput = matching ? { id: { in: matching.ids } } : {
    ...(f.status ? { status: f.status } : {}),
    ...(f.today ? { createdAt: { gte: start, lt: end } } : {}),
  };
  const count = matching ? matching.count : await getDb().qbOrder.count({ where });
  const page = Math.min(f.page, Math.max(1, Math.ceil(count / 20)));
  const rows = await getDb().qbOrder.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, skip: matching ? 0 : (page - 1) * 20, include: { groupBuy: { select: { title: true } }, checkout: { include: { items: true, fulfillmentGroups: true } } } });
  return { rows, count, page };
}
export async function purchaseDetail(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  return getDb().checkout.findUnique({ where: { id }, include: { ...lifecycleInclude, payment: { include: { bankReport: { select: { lastFive: true } }, receipts: true } }, audits: { orderBy: { createdAt: "desc" }, take: 100 }, outbox: { orderBy: { createdAt: "desc" }, take: 50 } } });
}
