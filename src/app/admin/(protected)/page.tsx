import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { getAdminDashboard, type AdminDashboardData } from "@/lib/admin/dashboard-service";
import { getAdminWorkspace } from "@/lib/admin/workspace";
import { formatTaipeiDisplayDateTime } from "@/lib/group-buys/time";
import { linkStyles, Card, disclosureStyles, EmptyState, ErrorNotice, PageHeader, buttonStyles, titleStyles, tableStyles } from "@/components/ui/primitives";
import { PaymentStatusBadge, PickupStatusBadge, StatusBadge } from "@/components/ui/status-badge";

const twdFormatter = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

type Workspace = Awaited<ReturnType<typeof getAdminWorkspace>>;

function SummaryCards({ data, workspace }: Readonly<{ data: AdminDashboardData; workspace: Workspace | null }>) {
  const summaries = [
    { label: "進行中團購", count: data.activeGroupBuyCount, href: "/admin/group-buys" },
    { label: "今日新增 QB 訂單", count: workspace?.todayOrderCount ?? "讀取失敗", href: "/admin/qbuy?queue=all" },
    { label: "今日新增舊制訂單", count: data.todayOrderCount, href: "/admin/orders" },
  ] as const;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {summaries.map((summary) => (
        <Link key={summary.label} href={summary.href} className={`group ${linkStyles.card}`}>
          <Card className="flex h-full items-center justify-between gap-4 p-5 transition group-hover:border-slate-300 group-hover:bg-slate-50 group-hover:shadow-md group-active:bg-slate-100 group-focus-visible:border-slate-400 group-focus-visible:ring-2 group-focus-visible:ring-slate-300 group-focus-visible:ring-offset-2">
            <div>
              <p className="text-sm font-semibold text-slate-600">{summary.label}</p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{summary.count}</p>
            </div>
            <span aria-hidden="true" className="text-xl text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-900">›</span>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function PendingWork({ workspace }: { workspace: Workspace }) {
  const work = workspace.work.filter(task => task.count > 0);
  return <Card className="p-5 sm:p-6"><h2 className={titleStyles.card}>待處理事項</h2><p className="mt-1 text-sm text-slate-600">優先核帳、付款異常與取消退款，再處理履約。以本次購買計數，同一購買可能出現在不同工作佇列。</p>
    {work.length ? <ul className="mt-4 divide-y divide-slate-100">{work.map(task => <li key={task.label}><Link href={task.href} className={linkStyles.row}><span>{task.label}</span><span className="shrink-0 font-bold text-amber-900">{task.count} 筆 ›</span></Link></li>)}</ul> : <p className="mt-4 text-sm text-slate-600">目前沒有需要處理的事項。</p>}
  </Card>;
}

function RecentQbOrders({ orders }: { orders: Workspace["recentOrders"] }) {
  return <Card className="p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className={titleStyles.card}>最近 QB 訂單</h2><Link href="/admin/qbuy?queue=all" className={buttonStyles.secondary}>全部 QB 訂單</Link></div><p className="mt-1 text-sm text-slate-600">依正式建單時間顯示最新 5 筆。</p>
    {orders.length ? <ul className="mt-4 divide-y divide-slate-100">{orders.map(order => <li key={order.orderNumber} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-mono font-bold">{order.orderNumber}</p><p className="mt-1 text-sm">{order.checkout.customerName} · {twdFormatter.format(order.totalAmount)}</p><p className="mt-1 text-xs text-slate-600">{formatTaipeiDisplayDateTime(order.createdAt)}</p></div><div className="flex flex-wrap items-center gap-3"><StatusBadge tone={order.status === "PAID" ? "green" : "slate"}>{order.status === "PAID" ? "已收款" : order.status === "CANCELLED" ? "已取消" : "狀態待確認"}</StatusBadge><Link href={`/admin/qbuy?queue=all&q=${encodeURIComponent(order.orderNumber)}`} className={buttonStyles.secondary}>查看訂單</Link></div></li>)}</ul> : <div className="mt-4"><EmptyState title="目前尚無 QB 訂單。" /></div>}
  </Card>;
}

function RecentOrders({ orders }: Readonly<{ orders: AdminDashboardData["recentOrders"] }>) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
        <div>
          <h2 className={titleStyles.card}>最近舊制訂單</h2>
          <p className="mt-1 text-sm text-slate-600">依成立時間顯示最新 5 筆訂單。</p>
        </div>
        <Link href="/admin/orders" className={buttonStyles.secondary}>全部舊制訂單 ›</Link>
      </div>
      {orders.length === 0 ? (
        <div className="p-5 sm:p-6"><EmptyState title="目前尚無訂單資料。" /></div>
      ) : (
        <div role="region" aria-label="最近訂單資料表（可水平捲動）" tabIndex={0} className="relative overflow-x-auto">
          <table className="w-full min-w-[58rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">訂單</th>
                <th scope="col" className="px-5 py-3 font-semibold">顧客</th>
                <th scope="col" className="px-5 py-3 font-semibold">團購 / 金額</th>
                <th scope="col" className="px-5 py-3 font-semibold">付款</th>
                <th scope="col" className="px-5 py-3 font-semibold">取貨</th>
                <th scope="col" className="px-5 py-3 font-semibold">成立時間</th>
                <th scope="col" className={tableStyles.actionHeader}><span className="sr-only">操作</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => (
                <tr key={order.publicCode} className="group transition hover:bg-slate-50">
                  <td className="px-5 py-4 font-mono font-bold text-slate-950">{order.publicCode}</td>
                  <td className="px-5 py-4 font-semibold text-slate-900">{order.customerName}</td>
                  <td className="max-w-64 px-5 py-4"><p className="truncate font-medium text-slate-800">{order.groupBuy.title}</p><p className="mt-1 font-bold text-slate-950">{twdFormatter.format(order.totalAmount)}</p></td>
                  <td className="px-5 py-4">{order.status === "PLACED" ? <PaymentStatusBadge paidAt={order.paidAt} /> : <StatusBadge>已取消</StatusBadge>}</td>
                  <td className="px-5 py-4">{order.status === "PLACED" ? <PickupStatusBadge pickedUpAt={order.pickedUpAt} /> : <StatusBadge>已取消</StatusBadge>}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatTaipeiDisplayDateTime(order.createdAt)}</td>
                  <td className={tableStyles.actionCell}><Link href={`/admin/orders/${order.publicCode}`} className={buttonStyles.secondary}>詳情 ›</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default async function AdminPage() {
  await requireAdmin();
  const now = new Date();
  const [result, workspace] = await Promise.all([getAdminDashboard(now), getAdminWorkspace(now).catch(() => null)]);

  return (
    <section>
      <PageHeader
        eyebrow="Operations"
        title="營運首頁"
        description="從待處理工作開始，掌握 QB 訂單與舊制訂單的營運狀況。"
      />
      <div className="mt-6">{workspace ? <PendingWork workspace={workspace} /> : <ErrorNotice>QB 工作資料讀取失敗，無法判定是否有待辦。<Link href="/admin" className={`ml-2 ${buttonStyles.secondary}`}>重新載入工作台</Link></ErrorNotice>}</div>
      {!result.ok ? (
        <div className="mt-7"><ErrorNotice>無法載入營運資料，請稍後再試。</ErrorNotice></div>
      ) : (
        <>
          <section aria-label="營運摘要" className="mt-6"><h2 className={`mb-4 ${titleStyles.card}`}>營運摘要</h2><SummaryCards data={result.value} workspace={workspace} /></section>
        </>
      )}
      {workspace && <div className="mt-6"><RecentQbOrders orders={workspace.recentOrders} /></div>}
      {result.ok && <details className="mt-6"><summary className={disclosureStyles}>舊制訂單待辦與最近紀錄</summary><p className="mb-4 text-sm">尚未確認收款 {result.value.unpaidOrderCount} 筆 · 待取貨 {result.value.awaitingPickupCount} 筆（兩項可能重疊）。</p><RecentOrders orders={result.value.recentOrders} /></details>}
      <nav aria-label="次要快捷操作" className="mt-6 flex flex-wrap gap-3"><Link href="/admin/group-buys/new" className={buttonStyles.secondary}>新增團購</Link><Link href="/admin/products/new" className={buttonStyles.secondary}>新增商品</Link></nav>
    </section>
  );
}
