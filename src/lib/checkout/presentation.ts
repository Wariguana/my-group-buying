// Customer-safe display data. Never include bank evidence or internal rate configuration.
export type CheckoutQuote = {
  subtotal: number;
  shippingAmount: number;
  totalAmount: number;
  quoteFingerprint: string;
  groups: {
    temperature: string;
    subtotal: number;
    shippingAmount: number;
    freeThreshold: number | null;
    waitUntil: string;
    items: { groupTitle: string; productName: string; quantity: number }[];
  }[];
};

export const checkoutLabels: Record<string, string> = {
  AWAITING_PAYMENT: "待付款", REPORTED: "待 QBUY 確認", ANOMALY: "付款異常",
  EXPIRED: "已逾期", RECEIVED: "已入帳，待建單", FINALIZED: "正式訂單已成立",
  REFUND_REQUIRED: "退款處理另列",
};

export function refundStatusLabel(status: string) {
  return ({ PENDING: "待退款（尚未執行退款）", PROCESSING: "退款處理中（尚未確認完成）", REFUNDED: "已退款", ERROR: "退款異常，客服處理中" } as Record<string, string>)[status] ?? "退款狀態待確認";
}

export function checkoutNextStep(status: string) {
  return ({
    AWAITING_PAYMENT: "請在六小時期限內完成轉帳及付款回報。末五碼與截圖僅供核對，並不代表已入帳。",
    REPORTED: "付款回報已收到，庫存保留待人工核帳。請勿重複付款；核實入帳後才會成立 QB 正式訂單。",
    ANOMALY: "需要人工確認付款。請聯絡客服核對實際入帳與差額，確認前請勿重複付款。",
    EXPIRED: "付款與回報期限已過。如已匯款但未回報，請聯絡客服核對，勿再次付款。",
    RECEIVED: "已核實銀行入帳，正式訂單尚在處理。請勿再次付款；你可以回到我的訂單查看進度。",
    FINALIZED: "正式訂單已成立。取消申請、退款與配送進度請查看下方連結。",
    REFUND_REQUIRED: "退款與訂單狀態分別追蹤。建立退款義務不代表已完成匯款，請查看退款明細。",
  } as Record<string, string>)[status] ?? "請聯絡客服確認目前狀態。";
}
