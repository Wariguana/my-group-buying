import { z } from "zod";
export const reasons = ["重複下單", "不需要", "數量錯誤", "配送資料問題", "付款／金額問題", "其他"] as const;
export const evidence = z.string().trim().min(3).max(500).refine(v => !/\d{10,}/.test(v), "請勿輸入完整銀行帳號");
export const cancelInput = z.object({ requestId: z.uuid(), orderId: z.uuid(), reason: z.enum(reasons), note: z.string().trim().max(500).default("") }).strict().refine(v => v.reason !== "其他" || v.note.length >= 3, "其他原因必須備註");
export const commandInput = z.object({ requestId: z.uuid(), evidence, confirmed: z.literal(true) });
export const shipmentInput = commandInput.extend({ groupId: z.uuid(), trackingNumber: z.string().trim().min(1).max(128), returnId: z.uuid().optional() }).strict();
export const eventInput = commandInput.extend({ shipmentId: z.uuid(), status: z.enum(["SHIPPED","IN_TRANSIT","READY","DELIVERED","COMPLETED","RETURNED","VOIDED"]), externalVoidConfirmed: z.boolean().optional() }).strict();
export const inspectionInput = commandInput.extend({ returnId: z.uuid(), quality: z.enum(["PASS","FAIL"]), quantity: z.number().int().positive(), responsibility: z.enum(["CUSTOMER","QBUY","CARRIER"]), method: z.enum(["SEVEN_ELEVEN","FAMILY_MART","HOME_DELIVERY"]), address: z.string().trim().min(5).max(300), storeId: z.string().trim().max(80).optional(), storeName: z.string().trim().max(80).optional(), waiveFee: z.boolean().default(false) }).strict();
export const refundInput = commandInput.extend({ refundId: z.uuid(), status: z.enum(["PROCESSING","REFUNDED","ERROR"]), amount: z.number().int().positive(), bankReference: z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9_-]+$/).refine(v => !/\d{10,}/.test(v)), secondConfirmation: z.boolean() }).strict();
export const labels: Record<string,string> = {HOME_DELIVERY:"宅配",SEVEN_ELEVEN:"7-ELEVEN",FAMILY_MART:"全家",AMBIENT:"常溫",CHILLED:"冷藏",FROZEN:"冷凍",PASS:"品檢合格",FAIL:"品檢不合格",CUSTOMER:"顧客責任",QBUY:"QBUY 責任",CARRIER:"物流商責任",PAID:"已付款",PENDING:"待處理",CANCELLED:"已取消／退款另列",APPROVED:"已核准取消",REJECTED:"已拒絕",WITHDRAWN:"已撤回",REVIEW_REQUIRED:"客服確認金額",PROCESSING:"退款處理中",REFUNDED:"已退款",ERROR:"異常",CREATED:"已建立物流（人工管理）",SHIPPED:"已交寄",IN_TRANSIT:"運送中",READY:"到店待取／配送中",DELIVERED:"已取貨／送達",COMPLETED:"已完成",RETURNED:"已退回",VOIDED:"已作廢",RECEIVED:"已收到退回包裹",AWAITING_FEE:"重寄待收運費",READY_TO_RESEND:"可安排重寄",RESENT:"已安排重寄",QUALITY_HOLD:"品質不合格，客服處理",FAILED:"通知失敗",SENT:"LINE 已接受（不代表已讀）",BLOCKED:"通知對象未驗證",LEGACY:"歷史通知未派送"};
export type QuoteGroup = {id:string; subtotal:number; beforeShipping:number; shippingAmount:number};
export function cancellationQuote(items: {groupBuyId:string;fulfillmentGroupId:string;unitPrice:number;quantity:number;discount:number}[], groups:{id:string;rateSnapshot:unknown;shippingAmount:number}[], cancelled:string[], target:string) {
 const affected = new Set(items.filter(i=>i.groupBuyId===target).map(i=>i.fulfillmentGroupId));
 const result: QuoteGroup[]=[];
 let merchandise=0, shippingAdjustment=0;
 for(const g of groups.filter(g=>affected.has(g.id))) {
  const rate=z.object({fee:z.number().int().nonnegative(),freeThreshold:z.number().int().nonnegative().nullable()}).parse(g.rateSnapshot);
  const active=items.filter(i=>i.fulfillmentGroupId===g.id&&!cancelled.includes(i.groupBuyId));
  const amount=(rows:typeof items)=>rows.reduce((n,i)=>n+i.unitPrice*i.quantity-i.discount,0);
  const freight=(rows:typeof items)=>!rows.length?0:rate.freeThreshold!==null&&amount(rows)>=rate.freeThreshold?0:rate.fee;
  const remaining=active.filter(i=>i.groupBuyId!==target);
  const beforeShipping=cancelled.length ? freight(active) : g.shippingAmount;
  const shippingAmount=freight(remaining);
  merchandise+=amount(active.filter(i=>i.groupBuyId===target));
  shippingAdjustment+=beforeShipping-shippingAmount;
  result.push({id:g.id,subtotal:amount(remaining),beforeShipping,shippingAmount});
 }
 return {merchandise,shippingAdjustment,amount:merchandise+shippingAdjustment,groups:result};
}
