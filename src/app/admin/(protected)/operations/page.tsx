import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { operationalHealth } from "@/lib/operations/health";
export const dynamic = "force-dynamic";
const labels: Record<string,string> = { expired: "Checkout 逾期超過 2 分鐘", reported: "待核帳超過 24 小時", anomalies: "付款異常（建立超過 24 小時）", unfinalized: "入帳後 15 分鐘尚未建單", refunds: "退款義務超過 24 小時", cancellations: "取消阻擋出貨超過 24 小時", shipmentPending: "截止後 24 小時未建物流（需人工確認資格）", shippingErrors: "退回／作廢物流待檢視", returns: "實收退回逾期 7 天", notifications: "通知失敗、阻擋或積壓 15 分鐘", inventory: "可用庫存異常" };
export default async function OperationsPage() {
  await requireAdmin();
  const h = await operationalHealth();
  return <div className="space-y-5"><h1 className="text-2xl font-bold">平台與營運監控</h1><p role="status">{h.healthy ? "關鍵系統檢查正常" : "需要處理關鍵異常"} · {h.at.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p><p>重新整理以取得最新資料。LINE 真實推播：{h.linePushEnabled ? "已開啟" : "停用"}。平台接受通知不代表顧客收到或閱讀。</p>
  {h.workers.map(w => <p key={w.name}>{w.name}：{w.healthy ? "正常" : "無成功紀錄／超過 3 分鐘／失敗"}；上次成功 {w.lastSuccessAt?.toISOString() ?? "尚無"}</p>)}
  <dl className="grid gap-3 sm:grid-cols-2">{Object.entries(h.queues).map(([key,count]) => <div key={key} className="rounded border p-3"><dt>{labels[key]}</dt><dd className="text-xl font-bold">{count}</dd></div>)}</dl><p>以上為待檢視案件，不能直接視為已遺失款項或已完成退款。</p><nav className="flex gap-5"><Link href="/admin/payments">付款與帳務人工查核</Link><Link href="/admin/qbuy">取消退款與履約佇列</Link></nav></div>;
}
