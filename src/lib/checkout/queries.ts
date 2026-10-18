import "server-only";
import { getDb } from "@/lib/db";
import { id } from "@/lib/commerce/validation";
export function listMyCheckouts(ownerId: string) { return getDb().checkout.findMany({ where: { customerAccountId: id.parse(ownerId) }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, totalAmount: true, createdAt: true, orders: { select: { orderNumber: true } }, fulfillmentGroups: { select: { id: true, method: true, temperature: true, shippingAmount: true } }, items: { select: { id: true, productName: true, groupTitle: true, quantity: true, unitPrice: true } } } }); }
export const checkoutLabels: Record<string, string> = { AWAITING_PAYMENT: "待付款", REPORTED: "待 QBUY 確認", ANOMALY: "付款異常", EXPIRED: "已逾期", RECEIVED: "已入帳，待建單", FINALIZED: "正式訂單已成立", REFUND_REQUIRED: "待退款處理" };
