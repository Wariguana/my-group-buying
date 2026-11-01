import "server-only";
import { getDb } from "@/lib/db";
import { getTaipeiCalendarDayBounds } from "@/lib/group-buys/time";
import { pendingDeliveryWork, purchaseQueueFilter } from "./orders";

// Each task has an explicit unit. Counts can overlap and are never summed.
export async function getAdminWorkspace(now: Date = new Date()) {
  const db = getDb();
  const { start, end } = getTaipeiCalendarDayBounds(now);
  const [shippingFilter, pending] = await Promise.all([purchaseQueueFilter("shippingError", now), pendingDeliveryWork()]);
  const [activeGroupBuys, todayPurchases, todayOrders, reported, anomalies, received, cancellations, refunds, refundErrors, shippingErrors, recentOrders] = await Promise.all([
    db.groupBuy.count({ where: { status: "PUBLISHED", startAt: { lte: now }, endAt: { gt: now } } }),
    db.checkout.count({ where: { createdAt: { gte: start, lt: end } } }),
    db.qbOrder.count({ where: { createdAt: { gte: start, lt: end } } }),
    db.checkout.count({ where: { status: "REPORTED" } }),
    db.checkout.count({ where: { status: "ANOMALY" } }),
    db.checkout.count({ where: { status: "RECEIVED" } }),
    db.checkout.count({ where: await purchaseQueueFilter("cancel", now) }),
    db.checkout.count({ where: await purchaseQueueFilter("refund", now) }),
    db.checkout.count({ where: await purchaseQueueFilter("refundError", now) }),
    db.checkout.count({ where: shippingFilter }),
    db.qbOrder.findMany({ take: 5, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { checkoutId: true, orderNumber: true, status: true, totalAmount: true, createdAt: true, checkout: { select: { customerName: true } }, groupBuy: { select: { title: true } } } }),
  ]);
  const shipmentGroups = pending.reduce((n, row) => n + row.groups, 0);
  return { activeGroupBuys, todayPurchases, todayOrders, shipmentGroups, shipmentPurchases: pending.length, recentOrders,
    tasks: [
      { key: "reported", label: "等待確認付款", description: "顧客已回報轉帳，請核對銀行實際入帳", count: reported, unit: "筆購買", href: "/admin/payments?status=REPORTED", critical: false },
      { key: "anomaly", label: "付款異常", description: "檢查入帳金額、差額與付款資料", count: anomalies, unit: "筆購買", href: "/admin/payments?status=ANOMALY", critical: true },
      { key: "received", label: "已確認收款，等待建立正式訂單", description: "銀行已確認入帳；下一步建立全部正式 QB 訂單", count: received, unit: "筆購買", href: "/admin/payments?status=RECEIVED", critical: false },
      { key: "cancel", label: "取消申請待審核", description: "查看取消理由；相關配送需等待審核結案", count: cancellations, unit: "筆購買", href: "/admin/qbuy?view=purchases&queue=cancel", critical: true },
      { key: "refund", label: "待處理退款", description: "包含待處理與處理中；不代表已退款", count: refunds, unit: "筆購買", href: "/admin/qbuy?view=purchases&queue=refund", critical: false },
      { key: "refundError", label: "退款異常", description: "確認銀行結果，避免重複退款", count: refundErrors, unit: "筆購買", href: "/admin/qbuy?view=purchases&queue=refundError", critical: true },
      { key: "shipment", label: "待建立物流", description: `涉及 ${pending.length} 筆購買；含待截單與退回處理，仍須通過出貨檢核`, count: shipmentGroups, unit: "個配送群組", href: "/admin/qbuy?view=purchases&queue=shipment", critical: false },
      { key: "shippingError", label: "出貨及退回異常", description: "物流已退回或作廢，且尚無有效替代物流", count: shippingErrors, unit: "筆購買", href: "/admin/qbuy?view=purchases&queue=shippingError", critical: true },
    ],
  };
}
