import "server-only";

import { getDb } from "@/lib/db";
import { getTaipeiCalendarDayBounds } from "@/lib/group-buys/time";

// Every task has its own unit. Checkout, QB order, and fulfillment group counts must not be summed.
export async function getAdminWorkspace(now: Date = new Date()) {
  const db = getDb();
  const { start, end } = getTaipeiCalendarDayBounds(now);
  const [
    activeGroupBuys, todayPurchases, todayOrders, reported, anomalies, received,
    cancellations, refunds, refundErrors, shipmentGroups, shippingErrors, recentOrders,
  ] = await Promise.all([
    db.groupBuy.count({ where: { status: "PUBLISHED", startAt: { lte: now }, endAt: { gt: now } } }),
    db.checkout.count({ where: { createdAt: { gte: start, lt: end } } }),
    db.qbOrder.count({ where: { createdAt: { gte: start, lt: end } } }),
    db.checkout.count({ where: { status: "REPORTED" } }),
    db.checkout.count({ where: { status: "ANOMALY" } }),
    db.checkout.count({ where: { status: "RECEIVED" } }),
    db.checkout.count({ where: { cancellations: { some: { status: { in: ["PENDING", "REVIEW_REQUIRED"] } } } } }),
    db.checkout.count({ where: { refunds: { some: { status: { in: ["PENDING", "PROCESSING"] } } } } }),
    db.checkout.count({ where: { refunds: { some: { status: "ERROR" } } } }),
    db.checkout.count({ where: {
      status: "FINALIZED", orders: { some: { status: "PAID" } },
      fulfillmentGroups: { some: { qbShipments: { none: { status: { notIn: ["VOIDED", "RETURNED"] } } } } },
    } }),
    db.checkout.count({ where: { qbShipments: { some: { status: { in: ["RETURNED", "VOIDED"] } } } } }),
    db.qbOrder.findMany({
      take: 5,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        orderNumber: true, status: true, totalAmount: true, createdAt: true,
        checkout: { select: { customerName: true } },
        groupBuy: { select: { title: true } },
      },
    }),
  ]);
  return {
    activeGroupBuys, todayPurchases, todayOrders, shipmentGroups,
    recentOrders,
    tasks: [
      { key: "anomaly", label: "付款異常待確認", description: "入帳金額或付款資料需要人工檢查", count: anomalies, unit: "筆購買", href: "/admin/payments?status=ANOMALY", critical: true },
      { key: "refundError", label: "退款異常", description: "查看退款失敗或需要再次查核的案件", count: refundErrors, unit: "筆購買", href: "/admin/qbuy?view=purchases&queue=refundError", critical: true },
      { key: "cancel", label: "取消申請待審核", description: "檢查取消理由與是否需要暫停出貨", count: cancellations, unit: "筆購買", href: "/admin/qbuy?view=purchases&queue=cancel", critical: true },
      { key: "reported", label: "等待確認付款", description: "顧客已回報轉帳，請核對銀行實際入帳", count: reported, unit: "筆購買", href: "/admin/payments?status=REPORTED", critical: false },
      { key: "received", label: "已收款，待建立訂單", description: "款項已確認，等待建立正式 QB 訂單", count: received, unit: "筆購買", href: "/admin/payments?status=RECEIVED", critical: false },
      { key: "refund", label: "等待處理退款", description: "已產生退款義務，但不代表已完成退款", count: refunds, unit: "筆購買", href: "/admin/qbuy?view=purchases&queue=refund", critical: false },
      { key: "shipment", label: "等待建立物流", description: "尚未建立有效物流的購買；實際可否建立仍須確認", count: shipmentGroups, unit: "筆購買", href: "/admin/qbuy?view=purchases&queue=shipment", critical: false },
      { key: "shippingError", label: "物流退回或作廢待檢查", description: "查看需人工確認的物流紀錄", count: shippingErrors, unit: "筆購買", href: "/admin/qbuy?view=purchases&queue=shippingError", critical: false },
    ],
  };
}
