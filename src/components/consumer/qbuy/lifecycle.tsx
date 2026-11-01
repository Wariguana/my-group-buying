import { disclosureStyles, titleStyles } from "@/components/consumer/ui/primitives";
import { labels, reasons, cancellationQuote } from "@/lib/qbuy/domain";
import type { customerLifecycle } from "@/lib/qbuy/queries";
import { QbuyForm } from "./form";
import { refundStatusLabel, refundReasonLabel } from "@/lib/checkout/presentation";
type Purchase = NonNullable<Awaited<ReturnType<typeof customerLifecycle>>>;
const time = (v: Date) => v.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
const label = (v: string) => v === "SENT" ? "LINE 已接受（不代表已讀）" : labels[v] ?? v;
export function LifecyclePanel({ c }: {
    c: Purchase;
}) {
    const cancelled = c.orders.filter(o => o.status === "CANCELLED").map(o => o.groupBuyId);
    return <div className="space-y-4"><p>本次購買原始總額 NT${c.totalAmount} · {time(c.createdAt)}</p>
 {c.orders.map(o => {
            const requests = c.cancellations.filter(r => r.orderId === o.id), items = c.items.filter(i => i.groupBuyId === o.groupBuyId), groups = items.map(i => i.fulfillmentGroupId);
            const quote = cancellationQuote(c.items, c.fulfillmentGroups, cancelled, o.groupBuyId);
            const pending = requests.some(r => ["PENDING", "REVIEW_REQUIRED"].includes(r.status));
            const canCancel = o.status === "PAID" && !pending && items.every(i => i.groupBuy.endAt > new Date()) && !c.qbShipments.some(s => groups.includes(s.fulfillmentGroupId));
            return <details key={o.id} open className="qbuy-panel space-y-3 p-4"><summary className={disclosureStyles}>{o.orderNumber} · {pending ? "取消審核中" : label(o.status)}</summary>
   {items.map(i => <p key={i.id}>{i.groupTitle}／{i.productName} × {i.quantity} · NT${i.unitPrice * i.quantity} · 出貨群組 {i.fulfillmentGroupId.slice(0, 8)}</p>)}
   {o.status === "PAID" && <p>取消試算：商品 NT${quote.merchandise}，運費調整 NT${quote.shippingAdjustment}，應退款 NT${quote.amount}。核准時依其餘訂單狀態重新計算；零或負值交客服確認。</p>}
   {o.status === "PAID" && <p className="my-2 rounded-lg bg-amber-50 p-3 text-sm">{pending ? "取消申請待審核，相關群組暫停出貨；核准取消與實際退款分別處理。" : canCancel ? "提出申請後需由管理員審核；核准取消不代表已完成退款。" : c.qbShipments.some(s => groups.includes(s.fulfillmentGroupId)) ? "已有物流歷史，無法直接提出取消。若需協助，請聯絡客服核對配送及退款安排。" : "團購已截止，已關閉取消申請；特殊狀況請聯絡客服。"}</p>}
   {canCancel && <QbuyForm operation="cancel" base={{ orderId: o.id }} label="提出取消申請" confirmationMessage={`確定申請取消 ${o.orderNumber}？相關出貨將暫停，須待審核；退款及運費依核准結果重新計算。`} fields={[{ name: "reason", label: "取消原因", options: reasons }, { name: "note", label: "備註（其他原因必填）", required: false }]}/>}
   {requests.map(r => <div key={r.id} className="my-3 border-l-4 pl-3"><p>{time(r.submittedAt)} · {r.status === "PENDING" ? "取消審核中" : label(r.status)} · {r.reason} {r.note}</p><p>{r.explanation} {r.reviewedAt && `處置時間：${time(r.reviewedAt)}`}</p>
    {r.status === "PENDING" && <QbuyForm operation="withdraw" base={{ id: r.id }} fields={[]} label="撤回待審申請" confirmationMessage={`確定撤回 ${o.orderNumber} 的取消申請？訂單將繼續安排出貨。`}/>}

   </div>)}
  </details>;
        })}
 <section className="space-y-3"><h3 className={titleStyles.card}>退款明細</h3>{!c.refunds.length && <p>尚無退款義務。</p>}{c.refunds.map(r => <article key={r.id} className="qbuy-panel my-3 space-y-2 p-4"><p>{refundReasonLabel(r.reason)} · NT${r.amount} · {refundStatusLabel(r.status)}{r.processedAt && ` · ${time(r.processedAt)}`}</p>
 {r.cancellationId && (() => { const request = c.cancellations.find(x => x.id === r.cancellationId); const q = request?.quote as {
            merchandise?: number;
            shippingAdjustment?: number;
        } | undefined; return <p>商品退款 NT${q?.merchandise}／運費調整 NT${q?.shippingAdjustment}</p>; })()}
 </article>)}</section>
 <section className="space-y-3"><h3 className={titleStyles.card}>出貨群組與物流歷史（人工管理）</h3>{c.fulfillmentGroups.map(g => {
            const shipments = c.qbShipments.filter(s => s.fulfillmentGroupId === g.id), adjusted = g.adjustments[0];
            return <article key={g.id} className="qbuy-panel my-3 space-y-2 p-4"><p className="font-semibold">群組 {g.id.slice(0, 8)} · {label(g.method)}／{label(g.temperature)}</p><p>原運費 NT${g.shippingAmount}／取消調整後 NT${adjusted?.shippingAmount ?? g.shippingAmount} · 不早於 {time(g.waitUntil)}</p>
 {!shipments.length && <p>待建立物流。</p>}


 {shipments.map(s => <div key={s.id} className="my-3 border-t pt-3"><p>{s.trackingNumber} · {label(s.status)} · {label(s.method)}{s.previousShipmentId && " · 重寄"}</p><p>配送資料：{(() => { const d = s.delivery as Record<string, string>; return [d.customerName, d.customerPhone, d.storeName, d.storeId, d.address].filter(Boolean).join(" · "); })()}</p>
 <ol>{s.events.map(e => <li key={e.id}>{time(e.createdAt)} · {label(e.status)}</li>)}</ol>


 </div>)}
 </article>;
        })}</section>
 <section className="space-y-3"><h3 className={titleStyles.card}>退回與重寄</h3>{c.returns.map(r => {
            const shipment = c.qbShipments.find(s => s.id === r.shipmentId)!;
            return <article key={r.id} className="qbuy-panel my-3 space-y-2 p-4"><p>{shipment.trackingNumber} · {label(r.status)} · 收到 {time(r.receivedAt)} · 客服期限 {time(r.deadline)}{r.deadline < new Date() && r.status !== "RESENT" && " · 逾期未處理"}</p><p>重寄運費 {r.fee === null ? "待確認" : `NT$${r.fee}`} · {r.paidAt ? "已確認費用" : "待確認費用"}</p>



 </article>;
        })}</section></div>;
}
