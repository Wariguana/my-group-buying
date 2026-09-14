import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { taipeiDisplayFormatter } from "@/lib/group-buys/time";
import { listAdminOrders } from "@/lib/orders/admin-service";

const twdFormatter = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

export default async function AdminOrdersPage() {
  await requireAdmin();
  const result = await listAdminOrders();

  return (
    <section>
      <h2 className="text-2xl font-semibold">訂單管理</h2>
      {!result.ok ? (
        <p role="alert" className="mt-8 rounded-md border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          無法載入訂單，請稍後再試。
        </p>
      ) : result.value.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-zinc-400 p-8 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">目前尚無訂單資料。</p>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {result.value.map((order) => (
            <li key={order.publicCode} className="rounded-md border border-zinc-300 p-5 dark:border-zinc-700">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-all text-lg font-semibold">{order.publicCode}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${order.status === "CANCELLED" ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"}`}>
                      {order.status}
                    </span>
                  </div>
                  <p>團購：{order.groupBuy.title}</p>
                  <p>訂購人：{order.customerName}／{order.customerPhone}</p>
                  <p>訂單總額：{twdFormatter.format(order.totalAmount)}</p>
                  <p>成立時間：{taipeiDisplayFormatter.format(order.createdAt)}</p>
                  {order.cancelledAt && <p>取消時間：{taipeiDisplayFormatter.format(order.cancelledAt)}</p>}
                </div>
                <Link href={`/admin/orders/${order.publicCode}`} className="rounded-md border border-zinc-400 px-3 py-1.5 text-sm font-medium">
                  查看訂單
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
