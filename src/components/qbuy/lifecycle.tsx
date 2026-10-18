import { labels, reasons, cancellationQuote } from "@/lib/qbuy/domain";
import type { customerLifecycle } from "@/lib/qbuy/queries";
import { QbuyForm, type Field } from "./form";
type Purchase=NonNullable<Awaited<ReturnType<typeof customerLifecycle>>>;
const ev:Field={name:"evidence",label:"查核依據（勿填完整銀行帳號）"};
const time=(v:Date)=>v.toLocaleString("zh-TW",{timeZone:"Asia/Taipei"});
const label=(v:string)=>labels[v]??v;
export function LifecyclePanel({c,admin=false}:{c:Purchase;admin?:boolean}) {
 const cancelled=c.orders.filter(o=>o.status==="CANCELLED").map(o=>o.groupBuyId);
 return <div className="space-y-4"><p>本次購買原始總額 NT${c.totalAmount} · {time(c.createdAt)}</p>
 {c.orders.map(o=>{
  const requests=c.cancellations.filter(r=>r.orderId===o.id),items=c.items.filter(i=>i.groupBuyId===o.groupBuyId),groups=items.map(i=>i.fulfillmentGroupId);
  const quote=cancellationQuote(c.items,c.fulfillmentGroups,cancelled,o.groupBuyId);
  const pending=requests.some(r=>["PENDING","REVIEW_REQUIRED"].includes(r.status));
  const canCancel=o.status==="PAID"&&!pending&&items.every(i=>i.groupBuy.endAt>new Date())&&!c.qbShipments.some(s=>groups.includes(s.fulfillmentGroupId));
  return <details key={o.id} open className="rounded-lg border p-4"><summary className="font-bold">{o.orderNumber} · {pending?"取消審核中":label(o.status)}</summary>
   {items.map(i=><p key={i.id}>{i.groupTitle}／{i.productName} × {i.quantity} · NT${i.unitPrice*i.quantity} · 出貨群組 {i.fulfillmentGroupId.slice(0,8)}</p>)}
   {o.status==="PAID"&&<p>取消試算：商品 NT${quote.merchandise}，運費調整 NT${quote.shippingAdjustment}，應退款 NT${quote.amount}。核准時依其餘訂單狀態重新計算；零或負值交客服確認。</p>}
   {!admin&&canCancel&&<QbuyForm operation="cancel" base={{orderId:o.id}} label="提出取消申請" fields={[{name:"reason",label:"取消原因",options:reasons},{name:"note",label:"備註（其他原因必填）",required:false}]}/>}
   {requests.map(r=><div key={r.id} className="my-3 border-l-4 pl-3"><p>{time(r.submittedAt)} · {r.status==="PENDING"?"取消審核中":label(r.status)} · {r.reason} {r.note}</p><p>{r.explanation} {r.reviewedAt&&`處置時間：${time(r.reviewedAt)}`}</p>
    {!admin&&r.status==="PENDING"&&<QbuyForm operation="withdraw" base={{id:r.id}} fields={[]} label="撤回待審申請"/>}
    {admin&&["PENDING","REVIEW_REQUIRED"].includes(r.status)&&<><p>涉及群組：{[...new Set(groups)].join("／")}。此案暫停相關出貨。</p><QbuyForm operation="review" base={{id:r.id,approve:true}} confirm label="核准取消" fields={[{name:"note",label:"審核依據及顧客可見說明"}]}/><QbuyForm operation="review" base={{id:r.id,approve:false}} confirm label="拒絕取消" fields={[{name:"note",label:"拒絕原因及顧客可見說明（必填）"}]}/></>}
   </div>)}
  </details>;
 })}
 <section><h3 className="text-lg font-bold">退款明細</h3>{!c.refunds.length&&<p>尚無退款義務。</p>}{c.refunds.map(r=><article key={r.id} className="my-3 rounded border p-3"><p>{r.reason} · NT${r.amount} · {r.status==="PENDING"?"待退款":label(r.status)}{r.processedAt&&` · ${time(r.processedAt)}`}</p>
 {r.cancellationId&&(()=>{const request=c.cancellations.find(x=>x.id===r.cancellationId);const q=request?.quote as {merchandise?:number;shippingAdjustment?:number}|undefined;return <p>商品退款 NT${q?.merchandise}／運費調整 NT${q?.shippingAdjustment}</p>;})()}
 {admin&&r.status!=="REFUNDED"&&<QbuyForm operation="refund" base={{refundId:r.id,amount:r.amount}} confirm label="記錄退款處理結果" fields={[{name:"status",label:"處理狀態",options:r.status==="PROCESSING"?["REFUNDED","ERROR"]:["PROCESSING","ERROR"]},{name:"bankReference",label:"銀行交易參考（非帳號）"},ev,{name:"secondConfirmation",label:"二次確認已核實實際退款成功（僅已退款時必勾）",type:"checkbox"}]}/>}</article>)}</section>
 <section><h3 className="text-lg font-bold">出貨群組與物流歷史（人工管理）</h3>{c.fulfillmentGroups.map(g=>{
 const shipments=c.qbShipments.filter(s=>s.fulfillmentGroupId===g.id),adjusted=g.adjustments[0];
 return <article key={g.id} className="my-3 rounded border p-4"><p className="font-semibold">群組 {g.id.slice(0,8)} · {label(g.method)}／{label(g.temperature)}</p><p>原運費 NT${g.shippingAmount}／取消調整後 NT${adjusted?.shippingAmount??g.shippingAmount} · 不早於 {time(g.waitUntil)}</p>
 {!shipments.length&&<p>待建立物流。</p>}
 {admin&&!shipments.some(s=>!["VOIDED","RETURNED"].includes(s.status))&&!shipments.some(s=>s.status==="RETURNED")&&<QbuyForm operation="shipment" base={{groupId:g.id}} confirm label="核實並建立物流" fields={[{name:"trackingNumber",label:"已核實追蹤號"},ev]}/>}
 {shipments.map(s=><div key={s.id} className="my-3 border-t pt-3"><p>{s.trackingNumber} · {label(s.status)} · {label(s.method)}{s.previousShipmentId&&" · 重寄"}</p><p>配送資料：{(() => {const d=s.delivery as Record<string,string>;return [d.customerName,d.customerPhone,d.storeName,d.storeId,d.address].filter(Boolean).join(" · ");})()}</p>
 <ol>{s.events.map(e=><li key={e.id}>{time(e.createdAt)} · {label(e.status)}{admin&&` · ${e.evidence}`}</li>)}</ol>
 {admin&&!["COMPLETED","RETURNED","VOIDED"].includes(s.status)&&<QbuyForm operation="event" base={{shipmentId:s.id}} confirm label="記錄核實物流事件" fields={[{name:"status",label:"新狀態",options:s.status==="CREATED"?["SHIPPED","VOIDED"]:s.status==="DELIVERED"?["COMPLETED"]:["IN_TRANSIT","READY","DELIVERED","RETURNED"]},ev,{name:"externalVoidConfirmed",label:"已確認物流商完成外部作廢（僅作廢時必勾）",type:"checkbox"}]}/>}
 {admin&&s.status==="RETURNED"&&!c.returns.some(r=>r.shipmentId===s.id)&&<QbuyForm operation="receive" base={{shipmentId:s.id}} confirm label="確認 QBUY 實際收到退回包裹" fields={[ev]}/>}
 </div>)}
 </article>;
 })}</section>
 <section><h3 className="text-lg font-bold">退回與重寄</h3>{c.returns.map(r=>{
 const shipment=c.qbShipments.find(s=>s.id===r.shipmentId)!;
 return <article key={r.id} className="my-3 rounded border p-3"><p>{shipment.trackingNumber} · {label(r.status)} · 收到 {time(r.receivedAt)} · 客服期限 {time(r.deadline)}{r.deadline<new Date()&&r.status!=="RESENT"&&" · 逾期未處理"}</p><p>重寄運費 {r.fee===null?"待確認":`NT$${r.fee}`} · {r.paidAt?"已確認費用":"待確認費用"}</p>
 {admin&&["RECEIVED","QUALITY_HOLD"].includes(r.status)&&<QbuyForm operation="inspect" base={{returnId:r.id}} confirm label="記錄數量品檢與重寄報價" fields={[{name:"quality",label:"品質是否可重寄",options:["FAIL","PASS"]},{name:"quantity",label:"實收商品總數量",type:"number"},{name:"responsibility",label:"責任歸屬",options:["CUSTOMER","QBUY","CARRIER"]},{name:"method",label:"新配送方式",options:["HOME_DELIVERY","SEVEN_ELEVEN","FAMILY_MART"]},{name:"address",label:"核實後完整配送地址"},{name:"storeId",label:"門市代碼（超商必填）",required:false},{name:"storeName",label:"門市名稱（超商必填）",required:false},{name:"waiveFee",label:"QBUY／物流責任經核准免收新運費",type:"checkbox"},ev]}/>}
 {admin&&r.status==="AWAITING_FEE"&&<QbuyForm operation="fee" base={{returnId:r.id,amount:r.fee}} confirm label="確認重寄運費實際入帳" fields={[{name:"reference",label:"銀行交易參考（非帳號）"},{name:"note",label:"銀行查核依據"}]}/>}
 {admin&&r.status==="READY_TO_RESEND"&&<QbuyForm operation="shipment" base={{groupId:shipment.fulfillmentGroupId,returnId:r.id}} confirm label="建立新重寄物流" fields={[{name:"trackingNumber",label:"新追蹤號"},ev]}/>}
 </article>;
 })}</section></div>;
}
