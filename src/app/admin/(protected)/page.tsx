import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { getAdminWorkspace } from "@/lib/admin/workspace";
import { formatTaipeiDisplayDateTime } from "@/lib/group-buys/time";
import { Card, EmptyState, ErrorNotice, PageHeader, buttonStyles } from "@/components/ui/primitives";

const currency = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });

export default async function AdminPage() {
  await requireAdmin();
  const data = await getAdminWorkspace().catch(() => null);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="QBUY ADMIN"
        title="工作總覽"
        description="先處理需要人工確認的事項，再查看購買、正式訂單與團購的最新狀況。"
        actions={<Link href="/admin/group-buys/new" className={buttonStyles.primary}>＋ 新增團購</Link>}
      />
      {!data ? (
        <ErrorNotice>工作資料暫時無法讀取，請重新整理。資料讀取失敗不代表沒有待辦事項。</ErrorNotice>
      ) : (
        <>
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-stone-950">需要優先處理</h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">依營運風險排列。各項可能重疊，不能直接加總。</p>
              </div>
              <Link className={buttonStyles.secondary} href="/admin/qbuy?view=purchases">查看購買紀錄</Link>
            </div>
            {data.tasks.some((task) => task.count > 0) ? (
              <ul className="mt-4 divide-y divide-stone-100">
                {data.tasks.map((task) => (
                  <li key={task.key}>
                    <Link href={task.href} className="group -mx-2 flex min-h-16 items-center gap-3 rounded-lg px-2 py-3 transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400">
                      <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${task.critical ? "bg-rose-500" : "bg-amber-500"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-stone-900">{task.label}</span>
                        <span className="mt-1 block text-sm text-stone-600">{task.description}</span>
                      </span>
                      <span className="shrink-0 text-sm font-bold text-stone-900">{task.count} {task.unit}</span>
                      <span aria-hidden="true" className="text-stone-400 transition group-hover:transtone-x-0.5">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4"><EmptyState title="目前沒有需要人工處理的案件" description="顧客仍可能有尚未回報付款的購買紀錄，請至購買紀錄查詢。" /></div>
            )}
          </Card>

          <section aria-labelledby="daily-summary">
            <h2 id="daily-summary" className="mb-3 text-lg font-bold text-stone-950">今日營運概況</h2>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                { label: "今日新增購買", count: data.todayPurchases, unit: "筆購買", href: "/admin/qbuy?view=purchases&today=1" },
                { label: "今日成立 QB 訂單", count: data.todayOrders, unit: "筆訂單", href: "/admin/qbuy?view=orders&today=1" },
                { label: "進行中的團購", count: data.activeGroupBuys, unit: "團", href: "/admin/group-buys" },
                { label: "待建立物流", count: data.shipmentGroups, unit: "個配送群組", href: "/admin/qbuy?view=purchases&queue=shipment" },
              ].map((item) => (
                <Link key={item.label} href={item.href} className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500">
                  <Card className="h-full p-4 transition hover:border-stone-400 hover:shadow-md sm:p-5">
                    <p className="text-sm font-semibold text-stone-600">{item.label}</p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-stone-950">{item.count}</p>
                    <p className="mt-1 text-xs text-stone-500">{item.unit}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">最近成立的 QB 訂單</h2>
              <Link href="/admin/qbuy?view=orders" className={buttonStyles.secondary}>查看全部訂單</Link>
            </div>
            <p className="mt-1 text-sm text-stone-600">正式訂單在確認收款並完成建單後才會出現。</p>
            {data.recentOrders.length ? (
              <ul className="mt-4 divide-y divide-stone-100">
                {data.recentOrders.map((order) => (
                  <li key={order.orderNumber}>
                    <Link href={`/admin/qbuy/${order.checkoutId}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg py-4 transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400">
                      <div className="min-w-0">
                        <p className="font-mono font-semibold text-stone-950">{order.orderNumber}</p>
                        <p className="mt-1 text-sm text-stone-700">{order.checkout.customerName} · {order.groupBuy.title}</p>
                        <p className="mt-1 text-xs text-stone-500">{formatTaipeiDisplayDateTime(order.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-bold text-stone-950">{currency.format(order.totalAmount)}</p>
                          <p className="text-xs text-stone-600">{order.status === "CANCELLED" ? "已取消（退款另列）" : order.status === "COMPLETED" ? "已完成" : "已付款，待履約"}</p>
                        </div>
                        <span aria-hidden="true" className="text-stone-400">›</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4"><EmptyState title="尚未建立正式 QB 訂單" description="顧客送出購買後，仍須完成銀行入帳確認與正式建單流程。" /></div>
            )}
          </Card>
          <section aria-label="常用操作">
            <h2 className="mb-3 text-lg font-bold">常用操作</h2>
            <div className="flex flex-wrap gap-3">
              <Link href="/admin/qbuy?view=purchases" className={buttonStyles.secondary}>查看購買紀錄</Link>
              <Link href="/admin/payments" className={buttonStyles.secondary}>確認付款</Link>
              <Link href="/admin/products" className={buttonStyles.secondary}>管理商品</Link>
              <Link href="/admin/commerce" className={buttonStyles.secondary}>查看商品規格與庫存</Link>
              {process.env.NODE_ENV !== "production" && <Link href="/admin/preview/orders" className={buttonStyles.secondary}>純 UI 模擬預覽（非實際訂單）</Link>}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
