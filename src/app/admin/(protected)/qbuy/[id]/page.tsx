import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth/current-admin";
import { purchaseDetail, purchaseStates, orderStates } from "@/lib/admin/orders";
import { labels } from "@/lib/qbuy/domain";
import { reasons } from "@/lib/checkout/validation";
import { LifecyclePanel } from "@/components/qbuy/lifecycle";
import { QbuyForm } from "@/components/qbuy/form";
import { OperationForm } from "../../payments/form";
import { PageHeader, buttonStyles } from "@/components/ui/primitives";
import styles from "@/components/admin/admin.module.css";
export const dynamic = "force-dynamic";
const time = (date: Date) => date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
const money = (value: number) => `NT$ ${value.toLocaleString("zh-TW")}`;
function returnPath(value: string | string[] | undefined) { return typeof value === "string" && /^\/admin\/qbuy\?(?!.*[\r\n#])/.test(value) ? value : "/admin/qbuy?view=purchases"; }
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const c = await purchaseDetail((await params).id);
  if (!c) notFound();
  const delivery = c.delivery as Record<string, string>;
  return <section className="space-y-5">
    <Link className={buttonStyles.secondary} href={returnPath((await searchParams).back)}>← 返回查詢結果</Link>
    <PageHeader title="購買與訂單詳情" description="依序確認商品、入帳、配送與售後；所有操作仍會由伺服器驗證。" />
    <nav aria-label="詳情章節" className={styles.steps}>{[["summary", "訂單摘要"], ["items", "商品明細"], ["payment", "付款確認"], ["shipping", "配送與物流"], ["cancellation", "取消與退款"], ["audit", "操作紀錄"]].map(([id, name]) => <a key={id} href={`#${id}`}>{name}</a>)}</nav>
    <div className={styles.detailGrid}>
      <section id="summary" className={styles.panel}><h2>訂單摘要</h2><dl className={styles.summaryGrid}><div><dt>顧客</dt><dd>{c.customerName}<br /><span className="text-sm font-normal">{c.customerPhone}</span></dd></div><div><dt>購買狀態</dt><dd>{purchaseStates[c.status] ?? "狀態待確認"}</dd></div><div><dt>本次購買原始總額</dt><dd>{money(c.totalAmount)}</dd></div><div><dt>購買時間</dt><dd>{time(c.createdAt)}</dd></div></dl>
        <p className="mt-4 text-sm text-stone-600">{c.orders.length} 筆正式 QB 訂單 · {c.fulfillmentGroups.length} 個配送群組 · 商品 {money(c.subtotal)} ＋ 原運費 {money(c.shippingAmount)}</p>
        {!c.orders.length && <p className="mt-3 text-sm">尚未建立正式訂單。顧客回報付款後，仍須確認銀行實際入帳並完成建單。</p>}
        {c.orders.map(o => <p key={o.id} className="mt-2 text-sm"><a href={`#order-${o.id}`} className="underline">{o.orderNumber}</a> · {orderStates[o.status] ?? "狀態待確認"} · {money(o.totalAmount)}</p>)}
      </section>
      <section id="items" className={styles.panel}><h2>商品與規格明細</h2><p className="text-sm text-stone-600">以下名稱、規格與成交價格使用購買當時快照。</p>{c.items.map(i => <article key={i.id} className={styles.item}><h3>{i.productName}</h3><p>{i.groupTitle} · {i.specification} · 數量 {i.quantity}</p><p>單價 {money(i.unitPrice)} · 商品小計 {money(i.unitPrice * i.quantity - i.discount)} · 配送群組 {i.fulfillmentGroupId.slice(0, 8)}</p></article>)}</section>
      <section id="payment" className={styles.panel}><h2>付款狀態與確認</h2><p className={styles.notice}>顧客回報轉帳及截圖僅為付款證據。確認銀行實際入帳後，才能建立正式訂單。退款需另外處理，不會在此自動匯款。</p>
        <dl className={`${styles.summaryGrid} my-4`}><div><dt>應收金額</dt><dd>{money(c.totalAmount)}</dd></div><div><dt>銀行已確認入帳</dt><dd>{money(c.payment?.confirmedAmount ?? 0)}</dd></div><div><dt>尚差金額</dt><dd>{money(Math.max(0, c.totalAmount - (c.payment?.confirmedAmount ?? 0)))}</dd></div><div><dt>溢付款</dt><dd>{money(Math.max(0, (c.payment?.confirmedAmount ?? 0) - c.totalAmount))}</dd></div></dl>
        <p className="text-sm">回報時間：{c.payment?.reportedAt ? time(c.payment.reportedAt) : "尚未回報"} · 帳號末五碼：{c.payment?.bankReport?.lastFive ?? "未提供"}</p>
        {c.payment?.bankReport && <a className="my-3 inline-flex min-h-11 items-center underline" href={`/api/checkout/${c.id}/screenshot`} target="_blank" rel="noreferrer">查看私有轉帳截圖（另開視窗）</a>}
        {c.payment?.anomalyReason && <p role="status" className={styles.notice}>付款異常：{c.payment.anomalyReason} · {c.payment.anomalyNote}</p>}
        {["REPORTED", "ANOMALY", "RECEIVED", "EXPIRED", "FINALIZED", "REFUND_REQUIRED"].includes(c.status) && <details><summary>登錄銀行實際入帳／補差額</summary><OperationForm operation="receipt" checkoutId={c.id} label="確認銀行已收款" confirmMessage="已核對銀行實際入帳、此筆顧客、金額及參考號？此操作會留下入帳紀錄。" fields={[{ name: "requestId", label: "操作識別", type: "hidden", value: randomUUID() }, { name: "bankReference", label: "銀行交易參考號（不可重複）" }, { name: "amount", label: "本筆實際入帳金額", type: "number" }, { name: "bankReceivedAt", label: "銀行入帳時間", type: "datetime-local" }, { name: "note", label: "銀行查核依據（測試請註明模擬）" }]} /></details>}
        {c.status === "RECEIVED" && <OperationForm operation="finalize" checkoutId={c.id} label="建立全部正式 QB 訂單" confirmMessage="確認已核實本次銀行入帳？將依購買內容，一次建立全部正式 QB 訂單；建單失敗可安全重試。" fields={[]} />}
        {["REPORTED", "ANOMALY", "RECEIVED"].includes(c.status) && <details><summary>付款資料異常與更正</summary><OperationForm operation="anomaly" checkoutId={c.id} label="記錄付款異常" fields={[{ name: "reason", label: "異常原因", options: reasons }, { name: "note", label: "說明與客服更正紀錄" }]} /></details>}
        {["EXPIRED", "ANOMALY", "RECEIVED", "REFUND_REQUIRED"].includes(c.status) && <details><summary>例外處理：逾期補單或退款</summary><OperationForm operation="exception" checkoutId={c.id} label="確認例外處理" confirmMessage="已依銀行入帳與客服紀錄核實？退款處理僅建立待退款紀錄，不會自動匯款；伺服器仍會驗證狀態及庫存。" fields={[{ name: "action", label: "處理方式", options: ["REBOOK", "REFUND"] }, { name: "note", label: "處理依據與客服紀錄" }]} /></details>}
        <details><summary>入帳紀錄</summary>{!c.payment?.receipts.length && <p>尚無已確認的銀行入帳。</p>}{c.payment?.receipts.map(r => <p className="my-3 text-sm" key={r.id}>{money(r.amount)} · 銀行入帳 {time(r.bankReceivedAt)} · 登錄 {time(r.recordedAt)}<br />參考號 {r.bankReference} · {r.note}</p>)}</details>
      </section>
      <section id="shipping" className={styles.panel}><h2>配送與物流</h2><p className="mb-3 text-sm">收件資料：{[delivery.storeName, delivery.storeId, delivery.address].filter(Boolean).join(" · ")}</p><LifecyclePanel c={c} admin section="shipping" /></section>
      <section id="cancellation" className={styles.panel}><h2>取消與退款</h2>{!c.orders.length && <p className="mb-3 text-sm">尚無正式訂單可取消。已入帳但無法建單時，請先查看付款例外處理。</p>}<LifecyclePanel c={c} admin section="cancellation" /></section>
      <section id="audit" className={styles.panel}><h2>操作紀錄</h2><p className="text-sm text-stone-600">顯示最近 100 筆稽核與 50 筆通知。技術資料僅供授權管理員查核。</p><details><summary>展開操作稽核與技術資料</summary><p className="my-3 text-xs">購買識別碼：{c.id}</p><div className={styles.audit}>{c.audits.map(a => <p key={a.id} className="my-3">{time(a.createdAt)} · {a.event} · 操作者 {a.actorId ?? "顧客／系統"}<br />{JSON.stringify(a.detail)}</p>)}</div></details>
        <details><summary>通知狀態與安全重試</summary>{c.outbox.map(e => <div key={e.id} className="my-3 text-sm"><p>{e.event} · {labels[e.status] ?? e.status} · 已嘗試 {e.attempts} 次 · {e.lastError ?? "無錯誤紀錄"}</p>{["BLOCKED", "RETRY"].includes(e.status) && <QbuyForm operation="retry" base={{ id: e.id }} fields={[]} confirm label="排入通知安全重試" />}</div>)}</details>
      </section>
    </div>
  </section>;
}
