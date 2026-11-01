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

// Correlate the order to BOTH this checkout and the item's group buy. A cancelled group must
// not be counted merely because another group in the same purchase still has a paid order.
export async function pendingDeliveryWork() {
  return getDb().$queryRaw<{ checkoutId: string; groups: number }[]>(Prisma.sql`
    SELECT g."checkoutId", count(*)::int AS groups FROM "FulfillmentGroup" g
    JOIN "Checkout" c ON c.id = g."checkoutId"
    WHERE c.status = 'FINALIZED'
      AND EXISTS (SELECT 1 FROM "CheckoutItem" i JOIN "QbOrder" o
        ON o."checkoutId" = i."checkoutId" AND o."groupBuyId" = i."groupBuyId"
        WHERE i."fulfillmentGroupId" = g.id AND o.status = 'PAID')
      AND NOT EXISTS (SELECT 1 FROM "QbShipment" s WHERE s."fulfillmentGroupId" = g.id AND s.status NOT IN ('VOIDED','RETURNED'))
    GROUP BY g."checkoutId"`);
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
  if (queue === "shippingError") {
    const rows = await getDb().$queryRaw<{checkoutId:string}[]>(Prisma.sql`SELECT DISTINCT s."checkoutId" FROM "QbShipment" s WHERE s.status IN ('RETURNED','VOIDED') AND NOT EXISTS (SELECT 1 FROM "QbShipment" active WHERE active."fulfillmentGroupId" = s."fulfillmentGroupId" AND active.status NOT IN ('RETURNED','VOIDED'))`);
    return { id: { in: rows.map(r => r.checkoutId) } };
  }
  if (queue === "shipment") return { id: { in: (await pendingDeliveryWork()).map(row => row.checkoutId) } };
  return filters[queue] ?? {};
}
export async function listPurchases(f: OrderFilters) {
  const { start, end } = getTaipeiCalendarDayBounds(new Date());
  const where: Prisma.CheckoutWhereInput = { AND: [await purchaseQueueFilter(f.queue), f.status ? { status: f.status } : {}, f.today ? { createdAt: { gte: start, lt: end } } : {}, f.q ? { OR: [
    { customerName: { contains: f.q, mode: "insensitive" } }, { customerPhone: { contains: f.q } },
    { orders: { some: { orderNumber: { contains: f.q, mode: "insensitive" } } } },
    { items: { some: { OR: [{ productName: { contains: f.q, mode: "insensitive" } }, { groupTitle: { contains: f.q, mode: "insensitive" } }] } } },
    ...(z.uuid().safeParse(f.q).success ? [{ id: f.q }] : []),
  ] } : {}] };
  const count = await getDb().checkout.count({ where });
  const page = Math.min(f.page, Math.max(1, Math.ceil(count / 20)));
  const rows = await getDb().checkout.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, skip: (page - 1) * 20, include: { items: true, orders: true, fulfillmentGroups: true, payment: { select: { confirmedAmount: true } }, cancellations: { select: { status: true } }, refunds: { select: { status: true } }, qbShipments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { status: true, fulfillmentGroupId: true, previousShipmentId: true } } } });
  return { rows, count, page };
}
export async function listOrders(f: OrderFilters) {
  const matchingItems = f.q ? await getDb().$queryRaw<{id:string}[]>(Prisma.sql`SELECT DISTINCT o.id FROM "QbOrder" o JOIN "CheckoutItem" i ON i."checkoutId" = o."checkoutId" AND i."groupBuyId" = o."groupBuyId" WHERE i."productName" ILIKE ${"%" + f.q + "%"}`) : [];
  const { start, end } = getTaipeiCalendarDayBounds(new Date());
  const where: Prisma.QbOrderWhereInput = { AND: [f.status ? { status: f.status } : {}, f.today ? { createdAt: { gte: start, lt: end } } : {}, f.q ? { OR: [
    { orderNumber: { contains: f.q, mode: "insensitive" } }, { groupBuy: { title: { contains: f.q, mode: "insensitive" } } },
    { checkout: { OR: [{ customerName: { contains: f.q, mode: "insensitive" } }, { customerPhone: { contains: f.q } }, ] } },
    { id: { in: matchingItems.map(i => i.id) } },
  ] } : {}] };
  const count = await getDb().qbOrder.count({ where });
  const page = Math.min(f.page, Math.max(1, Math.ceil(count / 20)));
  const rows = await getDb().qbOrder.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, skip: (page - 1) * 20, include: { groupBuy: { select: { title: true } }, checkout: { include: { items: true, fulfillmentGroups: true } } } });
  return { rows, count, page };
}
export async function purchaseDetail(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  return getDb().checkout.findUnique({ where: { id }, include: { ...lifecycleInclude, payment: { include: { bankReport: { select: { lastFive: true } }, receipts: true } }, audits: { orderBy: { createdAt: "desc" }, take: 100 }, outbox: { orderBy: { createdAt: "desc" }, take: 50 } } });
}
