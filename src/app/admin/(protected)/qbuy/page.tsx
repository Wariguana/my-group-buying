import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { parseOrderFilters, orderListUrl, listOrders, listPurchases, purchaseStates, orderStates, workQueues } from "@/lib/admin/orders";
import { labels } from "@/lib/qbuy/domain";
import { EmptyState, PageHeader, buttonStyles } from "@/components/ui/primitives";
import styles from "@/components/admin/admin.module.css";
export const dynamic = "force-dynamic";
const time = (date: Date) => date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
const money = (value: number) => `NT$ ${value.toLocaleString("zh-TW")}`;
function Badge({ value, text }: { value: string; text: string }) { return <span className={styles.badge} data-tone={["ANOMALY", "REFUND_REQUIRED", "ERROR"].includes(value) ? "danger" : ["REPORTED", "RECEIVED", "PENDING"].includes(value) ? "warning" : ["COMPLETED", "REFUNDED"].includes(value) ? "success" : undefined}>{text}</span>; }
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const f = parseOrderFilters(await searchParams);
  const purchases = f.view === "purchases" ? await listPurchases(f) : null;
  const orders = f.view === "orders" ? await listOrders(f) : null;
  const result = purchases ?? orders!;
  const current = { ...f, page: result.page };
  const back = orderListUrl(current);
  const detail = (id: string) => `/admin/qbuy/${id}?back=${encodeURIComponent(back)}`;
  return <section className="space-y-5">
    <PageHeader title="訂單管理" description="先確認購買與付款，再處理正式訂單、配送及售後。" />
    <nav aria-label="交易類型" className={styles.tabs}>{(["purchases", "orders"] as const).map(view => <Link key={view} href={orderListUrl(f, { view, status: "", page: 1 })} aria-current={f.view === view ? "page" : undefined} className={styles.tab}>{view === "purchases" ? "購買紀錄" : "正式訂單"}</Link>)}</nav>
    <p className={styles.notice}>{f.view === "purchases" ? "一次購買是一筆購買紀錄，可能包含多筆正式 QB 訂單與多個配送群組。顧客回報轉帳後，仍需核對銀行實際入帳。" : "這裡只列已完成建單的正式 QB 訂單。同一次購買跨團購時，會分開建立 QB 訂單；取消與退款狀態分開記錄。"}</p>
    <form method="get" aria-label="訂單查詢條件" className={`${styles.panel} ${styles.filters}`}>
      <input type="hidden" name="view" value={f.view} />
      <label>搜尋編號、顧客、電話、商品或團購<input name="q" defaultValue={f.q} maxLength={100} placeholder="輸入查詢內容" autoComplete="off" /></label>
      <label>{f.view === "purchases" ? "購買狀態" : "正式訂單狀態"}<select name="status" defaultValue={f.status}><option value="">全部狀態</option>{Object.entries(f.view === "purchases" ? purchaseStates : orderStates).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      {f.view === "purchases" && <label>處理類型<select name="queue" defaultValue={f.queue}>{Object.entries(workQueues).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>}
      <label className="!flex flex-row items-center gap-2 py-2"><input type="checkbox" name="today" value="1" defaultChecked={f.today} />只看今天新增（台北時間）</label>
      <div className="flex flex-wrap gap-2"><button className={buttonStyles.primary}>套用查詢</button><Link className={buttonStyles.secondary} href={`/admin/qbuy?view=${f.view}`}>清除條件</Link></div>
    </form>
    <p className="text-sm text-stone-600" role="status">共 {result.count} 筆{f.view === "purchases" ? "購買紀錄" : "正式訂單"} · 第 {result.page} / {Math.max(1, Math.ceil(result.count / 20))} 頁 · 每頁 20 筆</p>
    {!result.rows.length && <EmptyState title="目前沒有符合條件的紀錄" description="可清除查詢條件，或改用其他狀態與處理類型。" />}
    {!!result.rows.length && <div className={styles.list}>
      <div className={styles.listHeader} aria-hidden="true"><span>編號與顧客</span><span>商品與配送</span><span>金額</span><span>狀態與下一步</span><span>操作</span></div>
      {purchases?.rows.map(c => {
        const cancel = c.cancellations.some(r => ["PENDING", "REVIEW_REQUIRED"].includes(r.status));
        const refundError = c.refunds.some(r => r.status === "ERROR");
        const refund = c.refunds.some(r => ["PENDING", "PROCESSING"].includes(r.status));
        const latest = [...new Map(c.qbShipments.slice().reverse().map(s=>[s.fulfillmentGroupId,s])).values()];
        const shippingError = latest.some(s=>["RETURNED","VOIDED"].includes(s.status));
        const afterSale = [...new Set(c.refunds.map(r=>r.status))];
        const next = cancel ? "審核取消，相關出貨暫停" : refundError ? "查明退款異常，避免重複退款" : refund ? "核實並處理退款" : c.status === "REPORTED" ? "查閱銀行入帳，再確認付款" : c.status === "RECEIVED" ? "建立正式 QB 訂單" : c.status === "ANOMALY" ? "核對差額與付款資料" : c.status === "FINALIZED" ? shippingError ? "核實物流異常與退回處理" : c.orders.every(o=>o.status==="CANCELLED") ? "查看取消與退款紀錄" : "查看配送與售後進度" : "等待顧客回報付款";
        return <article className={styles.row} key={c.id} data-testid="purchase-row">
          <div><small>購買紀錄 {c.id.slice(0, 8)}</small><h2><Link className={styles.rowTitle} href={detail(c.id)}>{c.customerName}</Link></h2><p>{c.customerPhone}</p><small>{time(c.createdAt)}</small></div>
          <div>{c.items.slice(0, 2).map(i => <p key={i.id}>{i.productName}／{i.specification} × {i.quantity}</p>)}{c.items.length > 2 && <p>另 {c.items.length - 2} 項商品</p>}<p className="mt-2">{[...new Set(c.fulfillmentGroups.map(g => labels[g.method] ?? "配送待確認"))].join("、")} · {c.fulfillmentGroups.length} 個配送群組</p><small>{c.orders.length ? c.orders.map(o => o.orderNumber).join("、") : "尚未建立正式訂單"}</small></div>
          <div><span className={styles.money}>{money(c.totalAmount)}</span><p>已確認入帳 {money(c.payment?.confirmedAmount ?? 0)}</p></div>
          <div><Badge value={c.status} text={purchaseStates[c.status] ?? "狀態待確認"} /><p className="mt-2">{next}</p>{cancel && <Badge value="PENDING" text="取消待審" />}<div className="mt-2 flex flex-wrap gap-1">{afterSale.map(status=><Badge key={status} value={status} text={({PENDING:"待處理退款",PROCESSING:"退款處理中",REFUNDED:"已退款",ERROR:"退款異常"} as Record<string,string>)[status]??"退款待確認"}/>)}{[...new Set(latest.map(s=>s.previousShipmentId?`重寄・${labels[s.status]??s.status}`:labels[s.status]??s.status))].map(status=><Badge key={status} value="" text={status}/>)}</div></div>
          <Link href={detail(c.id)} className={buttonStyles.secondary}>查看詳情</Link>
        </article>;
      })}
      {orders?.rows.map(o => <article className={styles.row} key={o.id} data-testid="order-row">
        <div><h2><Link className={styles.rowTitle} href={`${detail(o.checkoutId)}#order-${o.id}`}>{o.orderNumber}</Link></h2><p>{o.checkout.customerName}</p><p>{o.checkout.customerPhone}</p><small>{time(o.createdAt)}</small></div>
        <div><h2>{o.groupBuy.title}</h2>{o.checkout.items.filter(i => i.groupBuyId === o.groupBuyId).map(i => <p key={i.id}>{i.productName}／{i.specification} × {i.quantity}</p>)}<small>{[...new Set(o.checkout.fulfillmentGroups.filter(g => o.checkout.items.some(i => i.groupBuyId === o.groupBuyId && i.fulfillmentGroupId === g.id)).map(g => labels[g.method] ?? g.method))].join("、")}</small></div>
        <div className={styles.money}>{money(o.totalAmount)}</div>
        <div><Badge value={o.status} text={orderStates[o.status] ?? "狀態待確認"} /><p className="mt-2">{o.status === "PAID" ? "查看截單時間、配送與取消申請" : o.status === "CANCELLED" ? "查看退款明細" : "查看履約紀錄"}</p></div>
        <Link href={`${detail(o.checkoutId)}#order-${o.id}`} className={buttonStyles.secondary}>查看詳情</Link>
      </article>)}
    </div>}
    <nav aria-label="訂單分頁" className="flex flex-wrap items-center gap-3">{result.page > 1 && <Link href={orderListUrl(current, { page: result.page - 1 })} className={buttonStyles.secondary}>上一頁</Link>}{result.page * 20 < result.count && <Link href={orderListUrl(current, { page: result.page + 1 })} className={buttonStyles.secondary}>下一頁</Link>}</nav>
    <details className={styles.panel}><summary className="font-semibold">進階工具與通知設定</summary><p className="my-3 text-sm text-stone-600">通知對象須核實身分、接收同意與推播資格。登入不等於可以推播。</p><Link href="/admin/qbuy/notifications" className={buttonStyles.secondary}>管理已核實通知對象</Link>{process.env.NODE_ENV !== "production" && <Link href="/admin/preview/orders" className="ml-3 underline">純 UI 模擬預覽</Link>}</details>
  </section>;
}
