import Link from "next/link";
import type { operationalHealth } from "@/lib/operations/health";
import { formatTaipeiDisplayDateTime } from "@/lib/group-buys/time";
import { buttonStyles, Card, disclosureStyles, messageStyles, titleStyles } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";

type Health = Awaited<ReturnType<typeof operationalHealth>>;
const metrics: Record<keyof Health["queues"], { label: string; href: string }> = {
  expired: { label: "購買逾期超過 2 分鐘", href: "/admin/payments" },
  reported: { label: "待核帳超過 24 小時", href: "/admin/payments" },
  anomalies: { label: "付款異常（建立超過 24 小時）", href: "/admin/payments" },
  unfinalized: { label: "入帳後 15 分鐘尚未建單", href: "/admin/payments" },
  refunds: { label: "退款義務超過 24 小時", href: "/admin/qbuy?queue=refund" },
  cancellations: { label: "取消阻擋出貨超過 24 小時", href: "/admin/qbuy?queue=cancel" },
  shipmentPending: { label: "截止後 24 小時未建物流（需人工確認資格）", href: "/admin/qbuy?queue=shipment" },
  shippingErrors: { label: "退回／作廢物流待檢視", href: "/admin/qbuy?queue=shippingError" },
  returns: { label: "實收退回逾期 7 天", href: "/admin/qbuy?queue=overdue" },
  notifications: { label: "通知失敗、阻擋或積壓 15 分鐘", href: "/admin/qbuy?queue=notifications" },
  inventory: { label: "可用庫存異常", href: "/admin/commerce" },
};

function workerStatus(worker: Health["workers"][number]) {
  if (!worker.hasRecord) return "無資料（未回報心跳）";
  if (worker.lastError) return "執行失敗";
  if (!worker.lastSuccessAt) return "未執行（無成功紀錄）";
  return worker.healthy ? "正常" : "已失聯（超過 3 分鐘）";
}

export function OperationsHealth({ health: h }: { health: Health }) {
  const counts = Object.entries(h.queues) as [keyof Health["queues"], number][];
  const actionable = counts.filter(([, count]) => count > 0);
  return <div className="space-y-6">
    <Card className="space-y-3 p-5 sm:p-6">
      <h2 className={titleStyles.card}>系統健康摘要</h2>
      <p role="status" className={h.healthy ? messageStyles.success : messageStyles.warning}>{h.healthy ? "關鍵系統檢查正常" : "需要處理關鍵異常"}{actionable.length > 0 ? ` · ${actionable.length} 類案件待檢視` : ""}</p>
      <p className="text-sm text-slate-600">最後更新：{formatTaipeiDisplayDateTime(h.at)}。重新整理以取得最新資料。</p>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">{h.workers.map(worker => <li key={worker.name} className="flex flex-wrap items-center gap-2"><span>{worker.name === "checkouts" ? "結帳處理" : "通知處理"}</span><StatusBadge tone={worker.healthy ? "green" : "amber"}>{workerStatus(worker)}</StatusBadge></li>)}</ul>
    </Card>
    <section aria-label="實際異常與待辦" className="space-y-3">
      <h2 className={titleStyles.card}>實際異常與待辦</h2>
      {actionable.length ? <ul className="divide-y divide-slate-200 rounded-xl border bg-white">{actionable.map(([key, count]) => <li key={key} className="flex flex-wrap items-center justify-between gap-3 p-4"><span>{metrics[key].label} <strong className="text-amber-900">{count} 件</strong></span><div className="flex flex-wrap gap-2"><Link href={metrics[key].href} className={buttonStyles.secondary}>前往處理</Link>{key === "refunds" && <Link href="/admin/qbuy?queue=refundError" className={buttonStyles.secondary}>退款異常</Link>}</div></li>)}</ul> : <p className={messageStyles.info}>目前沒有監控佇列待辦。{h.healthy ? "" : "工作程序仍需檢查，不能據此判定系統正常。"}</p>}
      <p className="text-sm text-slate-600">各指標可能涉及相同購買，不合計為訂單數。待檢視案件不代表款項遺失或退款完成。</p>
    </section>
    <details className="rounded-xl border bg-white p-3"><summary className={disclosureStyles}>詳細技術診斷（Worker 與全部 11 項監控指標）</summary>
      <div className="space-y-5 p-2">
        <section className="space-y-2"><h2 className={titleStyles.card}>工作程序診斷</h2>{h.workers.map(worker => <div key={worker.name} className="rounded-lg border p-3"><h3 className="font-semibold">{worker.name === "checkouts" ? "Checkout Worker" : "Notification Worker"}</h3><p>狀態：{workerStatus(worker)}</p><p>最近成功時間：{worker.lastSuccessAt ? formatTaipeiDisplayDateTime(worker.lastSuccessAt) : "無資料（尚無成功紀錄）"}</p><p>最近錯誤：{worker.lastError ?? "無錯誤紀錄"}</p></div>)}</section>
        <dl className="grid gap-3 sm:grid-cols-2">{counts.map(([key, count]) => <div key={key} className="rounded-lg border p-3"><dt className="text-sm text-slate-600">{metrics[key].label}</dt><dd className="mt-1 font-semibold">{count} 件</dd></div>)}</dl>
        <p className="text-sm text-slate-600">LINE 真實推播：{h.linePushEnabled ? "已開啟" : "停用"}。平台接受通知不代表顧客收到或閱讀。</p>
        <nav aria-label="監控查核入口" className="flex flex-wrap gap-3"><Link className={buttonStyles.secondary} href="/admin/payments">付款與帳務人工查核</Link><Link className={buttonStyles.secondary} href="/admin/qbuy">取消退款與履約佇列</Link></nav>
      </div>
    </details>
  </div>;
}
