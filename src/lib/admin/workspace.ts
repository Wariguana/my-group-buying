import "server-only";
import { getDb } from "@/lib/db";
import { getTaipeiCalendarDayBounds } from "@/lib/group-buys/time";
import { lifecycleQueueFilters } from "@/lib/qbuy/queries";
import type { Prisma } from "@/generated/prisma/client";

// Read-only projections. Reuse the workbench filters so its counts and links agree.
export async function getAdminWorkspace(now = new Date()) {
  const db = getDb();
  const filters = lifecycleQueueFilters(now);
  const tasks: { label: string; href: string; where: Prisma.CheckoutWhereInput }[] = [
    { label: "待核帳", href: "/admin/payments", where: { status: "REPORTED" } },
    { label: "付款異常", href: "/admin/payments", where: { status: "ANOMALY" } },
    { label: "已入帳待建單", href: "/admin/payments", where: { status: "RECEIVED" } },
    ...([['refundError', '退款異常'], ['cancel', '取消待審／出貨阻擋'], ['refund', '待退款／處理中'], ['shippingError', '出貨異常'], ['returned', '退回待處理'], ['shipment', '待建立物流']] as const).map(([key, label]) => ({ label, href: `/admin/qbuy?queue=${key}`, where: filters[key] })),
  ];
  const { start, end } = getTaipeiCalendarDayBounds(now);
  const [work, todayOrderCount, recentOrders] = await Promise.all([
    Promise.all(tasks.map(async ({ label, href, where }) => ({ label, href, count: await db.checkout.count({ where }) }))),
    db.qbOrder.count({ where: { createdAt: { gte: start, lt: end } } }),
    db.qbOrder.findMany({ take: 5, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { orderNumber: true, status: true, totalAmount: true, createdAt: true, checkout: { select: { customerName: true } } } }),
  ]);
  return { work, todayOrderCount, recentOrders };
}
