import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { getAdminDashboard, type AdminDashboardData } from "@/lib/admin/dashboard-service";
import { formatTaipeiDisplayDateTime } from "@/lib/group-buys/time";
import { Card, EmptyState, ErrorNotice, PageHeader, buttonStyles } from "@/components/ui/primitives";
import { PaymentStatusBadge, PickupStatusBadge, StatusBadge } from "@/components/ui/status-badge";

const twdFormatter = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

function SummaryCards({ data }: Readonly<{ data: AdminDashboardData }>) {
  const summaries = [
    { label: "進行中團購", count: data.activeGroupBuyCount, href: "/admin/group-buys" },
    { label: "尚未確認收款", count: data.unpaidOrderCount, href: "/admin/orders" },
    { label: "待取貨", count: data.awaitingPickupCount, href: "/admin/orders" },
    { label: "今日新增訂單", count: data.todayOrderCount, href: "/admin/orders" },
  ] as const;

  return (
    <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {summaries.map((summary) => (
        <Link key={summary.label} href={summary.href} className="group block cursor-pointer rounded-xl focus-visible:outline-none">
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

function PendingWork({ data }: Readonly<{ data: AdminDashboardData }>) {
  const hasPendingWork = data.unpaidOrderCount > 0 || data.awaitingPickupCount > 0;

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-bold text-slate-950">待處理事項</h2>
      <p className="mt-1 text-sm text-slate-600">需要進一步處理的成立訂單。</p>
      <div className="mt-4">
        {!hasPendingWork ? (
          <EmptyState title="目前沒有需要處理的事項。" />
        ) : (
          <ul className="divide-y divide-slate-100">
            <li>
              <Link href="/admin/orders" className="group -mx-3 flex cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-3 transition hover:bg-slate-50 active:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300">
                <span className="font-medium text-slate-700">尚未確認收款</span>
                <span className="flex items-center gap-3 font-bold text-slate-800"><span>{data.unpaidOrderCount} 筆</span><span aria-hidden="true" className="text-lg leading-none text-slate-500 transition group-hover:text-slate-900">›</span></span>
              </Link>
            </li>
            <li>
              <Link href="/admin/orders" className="group -mx-3 flex cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-3 transition hover:bg-slate-50 active:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300">
                <span className="font-medium text-slate-700">待取貨</span>
                <span className="flex items-center gap-3 font-bold text-slate-800"><span>{data.awaitingPickupCount} 筆</span><span aria-hidden="true" className="text-lg leading-none text-slate-500 transition group-hover:text-slate-900">›</span></span>
              </Link>
            </li>
          </ul>
        )}
      </div>
    </Card>
  );
}

function RecentOrders({ orders }: Readonly<{ orders: AdminDashboardData["recentOrders"] }>) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-lg font-bold text-slate-950">最近訂單</h2>
          <p className="mt-1 text-sm text-slate-600">依成立時間顯示最新 5 筆訂單。</p>
        </div>
        <Link href="/admin/orders" className={buttonStyles.secondary}>全部訂單 ›</Link>
      </div>
      {orders.length === 0 ? (
        <div className="p-5 sm:p-6"><EmptyState title="目前尚無訂單資料。" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[58rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">訂單</th>
                <th scope="col" className="px-5 py-3 font-semibold">顧客</th>
                <th scope="col" className="px-5 py-3 font-semibold">團購 / 金額</th>
                <th scope="col" className="px-5 py-3 font-semibold">付款</th>
                <th scope="col" className="px-5 py-3 font-semibold">取貨</th>
                <th scope="col" className="px-5 py-3 font-semibold">成立時間</th>
                <th scope="col" className="px-5 py-3"><span className="sr-only">操作</span></th>
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
                  <td className="px-5 py-4 text-right"><Link href={`/admin/orders/${order.publicCode}`} className={buttonStyles.textAction}>詳情 ›</Link></td>
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
  const result = await getAdminDashboard(new Date());

  return (
    <section>
      <PageHeader
        eyebrow="Operations"
        title="營運首頁"
        description="查看目前團購、訂單收款與取貨處理狀況。"
        actions={<Link href="/admin/group-buys/new" className={buttonStyles.primary}><span aria-hidden="true" className="mr-1.5">+</span>新增團購</Link>}
      />
      {!result.ok ? (
        <div className="mt-7"><ErrorNotice>無法載入營運資料，請稍後再試。</ErrorNotice></div>
      ) : (
        <>
          <SummaryCards data={result.value} />
          <div className="mt-6"><PendingWork data={result.value} /></div>
          <div className="mt-6"><RecentOrders orders={result.value.recentOrders} /></div>
        </>
      )}
    </section>
  );
}
