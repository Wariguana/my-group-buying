import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { getAdminWorkspace } from "@/lib/admin/workspace";
import { orderStates } from "@/lib/admin/orders";
import { formatTaipeiDisplayDateTime } from "@/lib/group-buys/time";
import { Card, buttonStyles, linkStyles, messageStyles, titleStyles } from "@/components/ui/primitives";
import styles from "@/components/admin/admin.module.css";

const currency = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });
const ordersUrl = "/admin/qbuy?view=orders";

export default async function AdminPage() {
  await requireAdmin();
  const data = await getAdminWorkspace().catch(() => null);
  const tasks = data?.tasks.filter(task => task.count > 0) ?? [];

  return (
    <section className="space-y-5 lg:space-y-6">
      <header className={styles.overviewHeader}>
        <div className="min-w-0">
          <p className="hidden text-xs font-bold tracking-[0.16em] text-stone-600 lg:block">QBUY ADMIN</p>
          <h1 className={titleStyles.page}>工作總覽</h1>
          <p className="mt-2 hidden text-base text-stone-600 lg:block">先處理需要人工確認的事項，再查看購買、正式訂單與團購的最新狀況。</p>
        </div>
        <Link href="/admin/group-buys/new" className={`${buttonStyles.primary} shrink-0 whitespace-nowrap`}><span aria-hidden="true">＋</span> 新增團購</Link>
      </header>
      <section aria-labelledby="work-tasks">
        <Card className={styles.overviewPanel}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="work-tasks" className={titleStyles.card}>需要處理</h2>
            <Link className={`${buttonStyles.secondary} hidden! lg:inline-flex!`} href="/admin/qbuy?view=purchases">查看購買紀錄</Link>
          </div>
          {!data ? (
            <div className={`${messageStyles.error} mt-2 flex flex-wrap items-center justify-between gap-2`}>
              <p role="alert">無法載入工作資料</p>
              {/* A full reload retries the failed server read. */}
              <a href="/admin" className={buttonStyles.secondary}>重試</a>
            </div>
          ) : tasks.length ? (
            <ul className="mt-2 divide-y divide-stone-200/75">
              {tasks.map(task => (
                <li key={task.key}>
                  <Link href={task.href} className={`${linkStyles.row} ${styles.taskLink}`}>
                    <span aria-hidden="true" className={`${styles.taskDot} ${task.critical ? "bg-rose-600" : "bg-amber-600"}`} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-stone-950">{task.label}</span>
                      <span className="block text-sm text-stone-600">{task.description}</span>
                    </span>
                    <span className={styles.taskCount}>{task.count} {task.unit}</span>
                    <span aria-hidden="true" className={styles.rowArrow}>›</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-700">目前沒有需要處理的事項</p>
          )}
        </Card>
      </section>

      {data && <div className={styles.metricsLayout}>
        <section aria-labelledby="daily-summary">
          <h2 id="daily-summary" className={`${titleStyles.card} mb-2`}>今日概況</h2>
          <div className={styles.dailyMetrics}>
            {[
              { label: "今日收到的購買", count: data.todayPurchases, unit: "筆", href: "/admin/qbuy?view=purchases&today=1" },
              { label: "今日成立的訂單", count: data.todayOrders, unit: "筆", href: "/admin/qbuy?view=orders&today=1" },
            ].map(item => (
              <Link key={item.label} href={item.href} className={`${linkStyles.card} ${styles.dailyMetric}`}>
                <span className="block text-sm font-semibold text-stone-700">{item.label}</span>
                <span className="text-3xl font-bold tabular-nums text-stone-950">{item.count}</span>
                <span className="ml-1 text-sm text-stone-600">{item.unit}</span>
              </Link>
            ))}
          </div>
        </section>
        <section aria-labelledby="current-summary">
          <h2 id="current-summary" className="mb-2 text-sm font-bold text-stone-700 lg:text-lg lg:text-stone-950">目前營運</h2>
          <div className={styles.currentMetrics}>
            <Link href="/admin/group-buys" className={`${linkStyles.card} ${styles.dailyMetric}`}>
              <span>目前開團</span> <strong>{data.activeGroupBuys}</strong> 團
            </Link>
            <Link href="/admin/qbuy?view=purchases&queue=shipment" className={`${linkStyles.card} ${styles.dailyMetric}`}>
              <span>待建立物流</span> <strong>{data.shipmentGroups}</strong> 個配送群組
            </Link>
          </div>
        </section>
      </div>}

      <div className="flex flex-col gap-5 lg:gap-6">
        <section aria-labelledby="quick-actions" className="lg:order-2">
          <h2 id="quick-actions" className={`${titleStyles.card} mb-2`}>常用操作</h2>
          <div className={styles.quickActions}>
            <Link href="/admin/qbuy?view=purchases" className={buttonStyles.secondary}>查看購買紀錄</Link>
            <Link href="/admin/payments" className={buttonStyles.secondary}>確認付款</Link>
            <Link href="/admin/products" className={buttonStyles.secondary}>管理商品</Link>
            <Link href="/admin/commerce" className={buttonStyles.secondary}>查看商品規格與庫存</Link>
          </div>
        </section>

        {data && <section aria-labelledby="recent-orders">
          <Card className={styles.overviewPanel}>
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <h2 id="recent-orders" className={titleStyles.card}>最近成立的訂單</h2>
              <Link href={ordersUrl} className={buttonStyles.secondary}>查看全部訂單 <span aria-hidden="true">→</span></Link>
            </div>
            {data.recentOrders.length ? (
              <ul className="mt-2 divide-y divide-stone-200/75">
                {data.recentOrders.map(order => (
                  <li key={order.orderNumber}>
                    <Link href={`/admin/qbuy/${order.checkoutId}?back=${encodeURIComponent(ordersUrl)}`} className={`${linkStyles.row} ${styles.recentLink}`}>
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold text-stone-950">{order.orderNumber}</p>
                        <p className="mt-1 text-sm text-stone-700">{order.checkout.customerName} · {order.groupBuy.title}</p>
                        <p className="mt-1 text-xs text-stone-600">{formatTaipeiDisplayDateTime(order.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="whitespace-nowrap font-bold tabular-nums text-stone-950">{currency.format(order.totalAmount)}</p>
                        <span className={styles.badge}>{orderStates[order.status] ?? "狀態待確認"}</span>
                      </div>
                      <span aria-hidden="true" className={styles.rowArrow}>›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-stone-600">尚未建立正式 QB 訂單</p>
            )}
          </Card>
        </section>}
      </div>
    </section>
  );
}
