import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { cancellationQuote, cancelInput, commandInput, evidence, shipmentInput, eventInput, inspectionInput, refundInput } from "./domain";
export class QbuyError extends Error {}
function fail(message:string):never {throw new QbuyError(message);}
type Tx=Prisma.TransactionClient;
const json=(value:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(value));
const include={items:{include:{groupBuy:true}},fulfillmentGroups:true,orders:true,payment:true,cancellations:true,qbShipments:true,refunds:true} as const;
async function admin(tx:Tx, actorId:string) { if(!await tx.user.findFirst({where:{id:z.uuid().parse(actorId),isActive:true}}))fail("需要有效管理員權限。"); }
async function locked(tx:Tx, checkoutId:string) {
 await tx.$queryRaw`SELECT id FROM "Checkout" WHERE id=${checkoutId}::uuid FOR UPDATE`;
 // Identical order for cancellation, review, shipment and event processing.
 await tx.$queryRaw`SELECT id FROM "FulfillmentGroup" WHERE "checkoutId"=${checkoutId}::uuid ORDER BY id FOR UPDATE`;
 return tx.checkout.findUniqueOrThrow({where:{id:checkoutId},include});
}
async function orderCheckout(tx:Tx, orderId:string) { return (await tx.qbOrder.findUniqueOrThrow({where:{id:z.uuid().parse(orderId)}})).checkoutId; }
async function audit(tx:Tx, checkoutId:string, event:string, detail:unknown, actorId?:string) {await tx.checkoutAudit.create({data:{checkoutId,event,detail:json(detail),actorId}});}
export async function notify(tx:Tx, checkoutId:string,event:string,eventKey:string,audience:"CUSTOMER"|"ADMIN",text:string) {
 let message=text;
 if(process.env.APP_BASE_URL){const target=new URL(event==="TRANSFER_REPORTED"?"/admin/payments":audience==="ADMIN"?"/admin/qbuy":`/my/orders/${checkoutId}`,process.env.APP_BASE_URL);if(["http:","https:"].includes(target.protocol))message+=`\n${target.href}`;}
 await tx.checkoutOutbox.upsert({where:{eventKey},create:{checkoutId,event,eventKey,audience,payload:{text:message}},update:{}});
}
async function stock(tx:Tx,checkoutId:string,items:{skuId:string;quantity:number}[],actorId:string,kind:"UNALLOCATE"|"DISPATCH") {
 const demand=new Map<string,number>();for(const i of items)demand.set(i.skuId,(demand.get(i.skuId)??0)+i.quantity);
 const skus=await tx.productSku.findMany({where:{id:{in:[...demand.keys()]}}});
 for(const productId of [...new Set(skus.map(s=>s.productId))].sort())await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${productId}::uuid FOR UPDATE`;
 for(const skuId of [...demand.keys()].sort()) {
  const current=await tx.skuInventory.findUniqueOrThrow({where:{skuId}});const quantity=demand.get(skuId)!;
  if(current.allocated<quantity)fail("庫存配置不一致，暫停操作。");
  const allocated=current.allocated-quantity,onHand=current.onHand-(kind==="DISPATCH"?quantity:0);
  await tx.skuInventory.update({where:{skuId},data:{allocated,onHand,version:{increment:1}}});
  await tx.inventoryMovement.create({data:{requestId:randomUUID(),skuId,checkoutId,actorId,kind,beforeOnHand:current.onHand,afterOnHand:onHand,beforeReserved:current.reserved,beforeAllocated:current.allocated,reserved:current.reserved,allocated,reason:`QB ${kind}`}});
 }
}
export async function submitCancellation(owner:string,raw:unknown) {
 const input=cancelInput.parse(raw);z.uuid().parse(owner);
 return getDb().$transaction(async tx=>{
  const c=await locked(tx,await orderCheckout(tx,input.orderId));
  if(c.customerAccountId!==owner)fail("無法存取此訂單。");
  const old=await tx.cancellationRequest.findUnique({where:{requestId:input.requestId}});
  if(old){if(old.orderId!==input.orderId||old.reason!==input.reason||old.note!==input.note)fail("操作識別碼已使用。");return old;}
  const order=c.orders.find(o=>o.id===input.orderId)!;
  const items=c.items.filter(i=>i.groupBuyId===order.groupBuyId);const ids=items.map(i=>i.fulfillmentGroupId);
  await tx.$queryRaw`SELECT id FROM "GroupBuy" WHERE id=${order.groupBuyId}::uuid FOR SHARE`;
  const group=await tx.groupBuy.findUniqueOrThrow({where:{id:order.groupBuyId}});
  if(order.status!=="PAID"||group.endAt<=new Date()||!items.length||c.qbShipments.some(s=>ids.includes(s.fulfillmentGroupId)))fail("已截止或已建立物流，請聯絡 LINE 客服。");
  if(c.cancellations.some(r=>r.orderId===order.id&&["PENDING","REVIEW_REQUIRED"].includes(r.status)))fail("已有未結案申請。");
  const quote=cancellationQuote(c.items,c.fulfillmentGroups,c.orders.filter(o=>o.status==="CANCELLED").map(o=>o.groupBuyId),order.groupBuyId);
  const request=await tx.cancellationRequest.create({data:{...input,checkoutId:c.id,customerAccountId:owner,quote:json(quote)}});
  await audit(tx,c.id,"CANCELLATION_SUBMITTED",{id:request.id,owner,groups:ids});
  await notify(tx,c.id,"CANCELLATION_SUBMITTED",`cancel:${request.id}:submitted`,"ADMIN","有新的取消申請，請登入 QBUY 取消審核佇列。");
  return request;
 },{timeout:15000});
}
export async function withdrawCancellation(owner:string,requestId:string) {
 return getDb().$transaction(async tx=>{
  const initial=await tx.cancellationRequest.findUniqueOrThrow({where:{id:z.uuid().parse(requestId)}});
  const c=await locked(tx,initial.checkoutId);if(c.customerAccountId!==owner)fail("無法存取此申請。");
  const r=await tx.cancellationRequest.findUniqueOrThrow({where:{id:requestId}});
  if(r.status==="WITHDRAWN")return;
  if(r.status!=="PENDING")fail("已審核申請不可撤回。");
  await tx.cancellationRequest.update({where:{id:r.id},data:{status:"WITHDRAWN",reviewedAt:new Date()}});
  await audit(tx,c.id,"CANCELLATION_WITHDRAWN",{id:r.id,owner});
 });
}
export async function reviewCancellation(actorId:string,requestId:string,approve:boolean,note:string) {
 evidence.parse(note);
 return getDb().$transaction(async tx=>{
  await admin(tx,actorId);const initial=await tx.cancellationRequest.findUniqueOrThrow({where:{id:z.uuid().parse(requestId)}});
  const c=await locked(tx,initial.checkoutId);const r=await tx.cancellationRequest.findUniqueOrThrow({where:{id:requestId}});
  if(!["PENDING","REVIEW_REQUIRED"].includes(r.status))fail("此申請已處置，請查看歷史。");
  const order=c.orders.find(o=>o.id===r.orderId)!;
  const quote=cancellationQuote(c.items,c.fulfillmentGroups,c.orders.filter(o=>o.status==="CANCELLED").map(o=>o.groupBuyId),order.groupBuyId);
  if(approve){
   if(order.status!=="PAID"||c.qbShipments.some(s=>quote.groups.some(g=>g.id===s.fulfillmentGroupId)))fail("履約狀態異常，停止核准。");
   // Eligibility was established at submission. No review-time deadline rejection.
   if(quote.amount<=0){await tx.cancellationRequest.update({where:{id:r.id},data:{status:"REVIEW_REQUIRED",quote:json(quote),actorId,reviewedAt:new Date(),explanation:note}});await audit(tx,c.id,"CANCELLATION_AMOUNT_HOLD",{id:r.id,quote},actorId);await notify(tx,c.id,"CANCELLATION_AMOUNT_HOLD",`hold:${r.id}`,"ADMIN","取消退款金額非正數，請客服確認補收或處理方式；出貨已暫停。");return;}
   await stock(tx,c.id,c.items.filter(i=>i.groupBuyId===order.groupBuyId),actorId,"UNALLOCATE");
   await tx.qbOrder.update({where:{id:order.id},data:{status:"CANCELLED"}});
   for(const g of quote.groups)await tx.fulfillmentAdjustment.create({data:{fulfillmentGroupId:g.id,cancellationId:r.id,subtotal:g.subtotal,shippingAmount:g.shippingAmount}});
   await tx.refundObligation.create({data:{checkoutId:c.id,reason:"CANCELLATION",eventKey:`cancel:${r.id}`,cancellationId:r.id,amount:quote.amount}});
  }
  await tx.cancellationRequest.update({where:{id:r.id},data:{status:approve?"APPROVED":"REJECTED",actorId,reviewedAt:new Date(),explanation:note,quote:json(quote)}});
  await audit(tx,c.id,approve?"CANCELLATION_APPROVED":"CANCELLATION_REJECTED",{id:r.id,quote,note},actorId);
  await notify(tx,c.id,"CANCELLATION_REVIEWED",`cancel:${r.id}:reviewed`,"CUSTOMER",approve?"取消申請已核准，退款待客服處理。":`取消申請未核准：${note}`);
 },{timeout:15000});
}
export async function processRefund(actorId:string,raw:unknown) {
 const input=refundInput.parse(raw);
 return getDb().$transaction(async tx=>{
  await admin(tx,actorId);const first=await tx.refundObligation.findUniqueOrThrow({where:{id:input.refundId}});await locked(tx,first.checkoutId);
  const r=await tx.refundObligation.findUniqueOrThrow({where:{id:first.id}});
  if(r.amount!==input.amount)fail("退款金額已變更，請重新確認。");
  if(r.status==="REFUNDED")fail("此退款已完成，不能再次結案。");
  if(input.status==="REFUNDED"&&(!input.secondConfirmation||r.status!=="PROCESSING"))fail("先標記處理中，再二次確認實際銀行退款成功。");
  await tx.refundObligation.update({where:{id:r.id},data:{status:input.status,bankReference:input.bankReference,processedAt:input.status==="REFUNDED"?new Date():null}});
  await audit(tx,r.checkoutId,"REFUND_UPDATED",input,actorId);
  if(input.status==="ERROR")await notify(tx,r.checkoutId,"REFUND_ERROR",`refund-error:${input.requestId}`,"ADMIN","退款處理異常，請登入 QB 工作台查核。");
  if(input.status==="REFUNDED")await notify(tx,r.checkoutId,"REFUND_COMPLETED",`refund:${r.id}:completed`,"CUSTOMER",`已確認退款 NT$${r.amount} 完成。`);
 });
}
async function fulfillmentReady(tx:Tx,c:Awaited<ReturnType<typeof locked>>,groupId:string) {
 const group=c.fulfillmentGroups.find(g=>g.id===groupId);if(!group) return fail("出貨群組不存在。");
 const items=c.items.filter(i=>i.fulfillmentGroupId===groupId&&!c.orders.some(o=>o.groupBuyId===i.groupBuyId&&o.status==="CANCELLED"));
 if(!items.length||c.status!=="FINALIZED"||c.payment?.status!=="FINALIZED"||c.payment.anomalyReason)fail("訂單或付款狀態不可履約。");
 const ids=[...new Set(items.map(i=>i.groupBuyId))].sort();
 for(const id of ids)await tx.$queryRaw`SELECT id FROM "GroupBuy" WHERE id=${id}::uuid FOR SHARE`;
 const groups=await tx.groupBuy.findMany({where:{id:{in:ids}}});
 const history=await tx.$queryRaw<{latest:Date|null}[]>`SELECT max(GREATEST("oldEndAt","newEndAt")) AS latest FROM "GroupBuyDeadlineHistory" WHERE "groupBuyId"=ANY(${ids}::uuid[])`;
 const now=new Date();
 if(group.waitUntil>now||groups.some(g=>g.endAt>now||g.status!=="PUBLISHED")||(history[0]?.latest&&history[0].latest>now))fail("相關開團尚未安全截止。");
 if(ids.some(id=>!c.orders.some(o=>o.groupBuyId===id&&o.status==="PAID")))fail("相關 QB 訂單尚未可履約。");
 if(c.cancellations.some(r=>["PENDING","REVIEW_REQUIRED"].includes(r.status)&&c.items.some(i=>i.groupBuyId===c.orders.find(o=>o.id===r.orderId)?.groupBuyId&&i.fulfillmentGroupId===groupId)))fail("取消申請尚未結案，暫停出貨。");
 if(c.qbShipments.some(s=>s.fulfillmentGroupId===groupId&&!["RETURNED","VOIDED"].includes(s.status)))fail("已有有效物流。");
 return {group,items};
}
export async function createShipment(actorId:string,raw:unknown) {
 const input=shipmentInput.parse(raw);
 return getDb().$transaction(async tx=>{
  await admin(tx,actorId);const g=await tx.fulfillmentGroup.findUniqueOrThrow({where:{id:input.groupId}});const c=await locked(tx,g.checkoutId);
  const previous=await tx.qbShipment.findUnique({where:{requestId:input.requestId}});if(previous){if(previous.fulfillmentGroupId!==input.groupId||previous.trackingNumber!==input.trackingNumber)fail("操作識別碼已使用。");return previous;}
  const {group,items}=await fulfillmentReady(tx,c,g.id);
  let delivery=c.delivery,method=group.method,previousShipmentId:string|undefined;
  const returned=c.qbShipments.filter(s=>s.fulfillmentGroupId===g.id&&s.status==="RETURNED");
  if(returned.length&&!input.returnId)fail("退回包裹必須經重寄流程。");
  if(input.returnId){const r=await tx.qbReturnCase.findUniqueOrThrow({where:{id:input.returnId}});if(r.checkoutId!==c.id||!returned.some(s=>s.id===r.shipmentId)||r.status!=="READY_TO_RESEND"||!r.paidAt||!r.delivery||!r.method)fail("重寄尚未完成品檢或運費確認。");delivery=r.delivery;method=r.method;previousShipmentId=r.shipmentId;}
  const rate=await tx.shippingRate.findUnique({where:{method_temperature:{method,temperature:group.temperature}}});
  if(!rate?.enabled||!rate.capabilityEvidence.trim())fail("配送能力尚未核實。");
  let weight=0,height=0;
  for(const item of items){const snap=z.object({methods:z.array(z.string()),weightGrams:z.number().positive(),lengthMm:z.number().positive(),widthMm:z.number().positive(),heightMm:z.number().positive(),note:z.string().nullable().optional()}).parse(item.shippingSnapshot);if(!snap.methods.includes(method)||snap.note?.trim()||snap.lengthMm>rate.maxLengthMm||snap.widthMm>rate.maxWidthMm)fail("商品配送能力不相容。");weight+=snap.weightGrams*item.quantity;height+=snap.heightMm*item.quantity;}
  if(weight>rate.maxWeightGrams||height>rate.maxHeightMm)fail("商品超出已確認配送能力。");
  const d=z.object({address:z.string().min(5),storeId:z.string().optional(),storeName:z.string().optional()}).parse(delivery);
  if(!c.customerName||!c.customerPhone||(method!=="HOME_DELIVERY"&&(!d.storeId||!d.storeName)))fail("收件資料不完整。");
  const shipment=await tx.qbShipment.create({data:{checkoutId:c.id,fulfillmentGroupId:g.id,requestId:input.requestId,previousShipmentId,method,delivery:json({ ...d,customerName:c.customerName,customerPhone:c.customerPhone}),items:json(items.map(i=>({id:i.id,skuId:i.skuId,groupBuyId:i.groupBuyId,quantity:i.quantity}))),trackingNumber:input.trackingNumber,evidence:input.evidence,actorId}});
  await tx.qbShipmentEvent.create({data:{shipmentId:shipment.id,requestId:randomUUID(),status:"CREATED",evidence:input.evidence,actorId}});
  if(input.returnId)await tx.qbReturnCase.update({where:{id:input.returnId},data:{status:"RESENT"}});
  await audit(tx,c.id,"SHIPMENT_CREATED",{id:shipment.id,...input},actorId);return shipment;
 },{timeout:15000});
}
const shipmentItems=z.array(z.object({id:z.uuid(),skuId:z.uuid(),groupBuyId:z.uuid(),quantity:z.number().int().positive()}));
export async function shipmentEvent(actorId:string,raw:unknown) {
 const input=eventInput.parse(raw);
 return getDb().$transaction(async tx=>{
  await admin(tx,actorId);const initial=await tx.qbShipment.findUniqueOrThrow({where:{id:input.shipmentId}});const c=await locked(tx,initial.checkoutId);
  const old=await tx.qbShipmentEvent.findUnique({where:{requestId:input.requestId}});if(old){if(old.shipmentId!==input.shipmentId||old.status!==input.status||old.evidence!==input.evidence)fail("操作識別碼已使用。");return;}
  const s=await tx.qbShipment.findUniqueOrThrow({where:{id:initial.id}});
  const allowed:Record<string,string[]>={CREATED:["SHIPPED","VOIDED"],SHIPPED:["IN_TRANSIT","READY","DELIVERED","RETURNED"],IN_TRANSIT:["READY","DELIVERED","RETURNED"],READY:["DELIVERED","RETURNED"],DELIVERED:["COMPLETED"]};
  if(!allowed[s.status]?.includes(input.status))fail("不允許此物流狀態轉換。");
  if(input.status==="VOIDED"&&!input.externalVoidConfirmed)fail("需先核實外部物流單已作廢。");
  const items=shipmentItems.parse(s.items);
  if(input.status==="SHIPPED"&&!s.previousShipmentId)await stock(tx,c.id,items,actorId,"DISPATCH");
  await tx.qbShipment.update({where:{id:s.id},data:{status:input.status}});
  if(input.status==="VOIDED"&&s.previousShipmentId)await tx.qbReturnCase.updateMany({where:{shipmentId:s.previousShipmentId,status:"RESENT"},data:{status:"READY_TO_RESEND"}});
  await tx.qbShipmentEvent.create({data:{shipmentId:s.id,requestId:input.requestId,status:input.status,evidence:input.evidence,actorId}});
  if(["DELIVERED","COMPLETED"].includes(input.status)){
   const all=await tx.qbShipment.findMany({where:{checkoutId:c.id,status:{in:["DELIVERED","COMPLETED"]}}});
   for(const order of c.orders.filter(o=>o.status==="PAID")){
    const groups=[...new Set(c.items.filter(i=>i.groupBuyId===order.groupBuyId).map(i=>i.fulfillmentGroupId))];
    if(groups.every(g=>all.some(s=>s.fulfillmentGroupId===g)))await tx.qbOrder.update({where:{id:order.id},data:{status:"COMPLETED"}});
   }
  }
  await audit(tx,c.id,"SHIPMENT_EVENT",input,actorId);
  if(input.status==="RETURNED")await notify(tx,c.id,"SHIPMENT_RETURNED",`returned:${input.requestId}`,"ADMIN","物流已退回，請核實是否收到包裹並進行品檢及客服處置。");
  await notify(tx,c.id,"SHIPMENT_EVENT",`shipment:${input.requestId}`,"CUSTOMER",`物流人工核實更新：${input.status}，可登入我的訂單查看。`);
 },{timeout:15000});
}
export async function receiveReturn(actorId:string,shipmentId:string,raw:unknown) {
 const input=commandInput.strict().parse(raw);
 return getDb().$transaction(async tx=>{
  await admin(tx,actorId);const s=await tx.qbShipment.findUniqueOrThrow({where:{id:z.uuid().parse(shipmentId)}});await locked(tx,s.checkoutId);
  const current=await tx.qbShipment.findUniqueOrThrow({where:{id:s.id}});if(current.status!=="RETURNED")fail("物流尚未退回。");
  const old=await tx.qbReturnCase.findUnique({where:{shipmentId:s.id}});if(old)return old;
  const receivedAt=new Date();const r=await tx.qbReturnCase.create({data:{shipmentId:s.id,checkoutId:s.checkoutId,receivedAt,deadline:new Date(receivedAt.getTime()+7*86400000),actorId,evidence:input.evidence}});
  await audit(tx,s.checkoutId,"RETURN_RECEIVED",{id:r.id,...input},actorId);return r;
 });
}
export async function inspectReturn(actorId:string,raw:unknown) {
 const input=inspectionInput.parse(raw);
 return getDb().$transaction(async tx=>{
  await admin(tx,actorId);const first=await tx.qbReturnCase.findUniqueOrThrow({where:{id:input.returnId}});await locked(tx,first.checkoutId);
  const r=await tx.qbReturnCase.findUniqueOrThrow({where:{id:first.id},include:{shipment:true}});
  if(!["RECEIVED","QUALITY_HOLD"].includes(r.status))fail("品檢已處理，不能覆寫已確認重寄資料。");
  const items=shipmentItems.parse(r.shipment.items);if(input.quantity!==items.reduce((n,i)=>n+i.quantity,0))fail("數量不符，請客服處理，不得重寄。");
  const group=await tx.fulfillmentGroup.findUniqueOrThrow({where:{id:r.shipment.fulfillmentGroupId}});
  const rate=await tx.shippingRate.findUnique({where:{method_temperature:{method:input.method,temperature:group.temperature}}});if(!rate?.enabled||!rate.capabilityEvidence)fail("配送能力未核實。");
  const originals=await tx.checkoutItem.findMany({where:{id:{in:items.map(i=>i.id)}}});
  let weight=0,height=0;
  for(const item of originals){const snap=z.object({methods:z.array(z.string()),weightGrams:z.number(),lengthMm:z.number(),widthMm:z.number(),heightMm:z.number()}).parse(item.shippingSnapshot);if(!snap.methods.includes(input.method)||snap.lengthMm>rate.maxLengthMm||snap.widthMm>rate.maxWidthMm)fail("配送不相容。");weight+=snap.weightGrams*item.quantity;height+=snap.heightMm*item.quantity;}
  if(weight>rate.maxWeightGrams||height>rate.maxHeightMm)fail("超出配送能力。");
  if(input.method!=="HOME_DELIVERY"&&(!input.storeId||!input.storeName))fail("需核實門市代碼、名稱及地址。");
  if(input.waiveFee&&input.responsibility==="CUSTOMER")fail("顧客責任需支付新運費。");
  const fee=input.waiveFee?0:rate.fee;
  await tx.qbReturnCase.update({where:{id:r.id},data:{inspection:json(input),responsibility:input.responsibility,method:input.method,delivery:{address:input.address,storeId:input.storeId??"",storeName:input.storeName??""},fee,status:input.quality==="FAIL"?"QUALITY_HOLD":fee?"AWAITING_FEE":"READY_TO_RESEND",paidAt:input.quality==="PASS"&&!fee?new Date():null}});
  await audit(tx,r.checkoutId,"RETURN_INSPECTED",input,actorId);
 });
}
export async function payResendFee(actorId:string,returnId:string,amount:number,reference:string,note:string) {
 z.number().int().positive().parse(amount);evidence.parse(note);z.string().min(3).max(120).regex(/^[A-Za-z0-9_-]+$/).parse(reference);
 return getDb().$transaction(async tx=>{
  await admin(tx,actorId);const first=await tx.qbReturnCase.findUniqueOrThrow({where:{id:z.uuid().parse(returnId)}});await locked(tx,first.checkoutId);
  const r=await tx.qbReturnCase.findUniqueOrThrow({where:{id:returnId}});if(r.status!=="AWAITING_FEE"||r.fee!==amount)fail("重寄金額或狀態不符。");
  await tx.qbReturnCase.update({where:{id:returnId},data:{status:"READY_TO_RESEND",paidAt:new Date(),bankReference:reference}});
  await audit(tx,r.checkoutId,"RESEND_FEE_RECEIVED",{returnId,amount,reference,note},actorId);
 });
}
