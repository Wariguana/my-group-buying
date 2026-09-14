import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import { taipeiDisplayFormatter } from "@/lib/group-buys/time";
import { getAdminOrderByPublicCode } from "@/lib/orders/admin-service";
import { AdminPickupOrderForm } from "./pickup-form";
import { AdminCancelOrderForm } from "./cancel-form";

const twdFormatter = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

function formatOptionalDate(value: Date | null): string {
  return value ? taipeiDisplayFormatter.format(value) : "另行通知";
}

export default async function AdminOrderDetailPage({
  params,
}: PageProps<"/admin/orders/[publicCode]">) {
  await requireAdmin();
  const { publicCode } = await params;
  const result = await getAdminOrderByPublicCode(publicCode);
  if (!result.ok && result.error === "NOT_FOUND") notFound();

  if (!result.ok) {
    return <p role="alert" className="text-red-700 dark:text-red-400">無法載入訂單，請稍後再試。</p>;
  }

  const order = result.value;
  return (
    <section>
      <Link href="/admin/orders" className="text-sm font-medium underline underline-offset-4">← 返回訂單列表</Link>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">訂單參考編號</p>
          <h2 className="mt-1 break-all text-2xl font-semibold">{order.publicCode}</h2>
        </div>
        <span className={`rounded-full px-3 py-1 font-medium ${order.status === "CANCELLED" ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"}`}>
          {order.status}
        </span>
      </div>

      {order.status === "PLACED" && <p className="mt-4 font-medium">{order.pickedUpAt ? `已取貨：${taipeiDisplayFormatter.format(order.pickedUpAt)}` : "待取貨"}</p>}

      <dl className="mt-6 grid gap-4 rounded-md border border-zinc-300 p-5 sm:grid-cols-2 dark:border-zinc-700">
        <div><dt className="text-sm text-zinc-600 dark:text-zinc-400">團購</dt><dd className="font-medium">{order.groupBuy.title}</dd></div>
        <div><dt className="text-sm text-zinc-600 dark:text-zinc-400">訂購期間</dt><dd className="font-medium">{taipeiDisplayFormatter.format(order.groupBuy.startAt)}－{taipeiDisplayFormatter.format(order.groupBuy.endAt)}</dd></div>
        <div><dt className="text-sm text-zinc-600 dark:text-zinc-400">訂購人</dt><dd className="font-medium">{order.customerName}</dd></div>
        <div><dt className="text-sm text-zinc-600 dark:text-zinc-400">手機</dt><dd className="font-medium">{order.customerPhone}</dd></div>
        <div><dt className="text-sm text-zinc-600 dark:text-zinc-400">成立時間</dt><dd className="font-medium">{taipeiDisplayFormatter.format(order.createdAt)}</dd></div>
        {order.cancelledAt && <div><dt className="text-sm text-zinc-600 dark:text-zinc-400">取消時間</dt><dd className="font-medium">{taipeiDisplayFormatter.format(order.cancelledAt)}</dd></div>}
        <div><dt className="text-sm text-zinc-600 dark:text-zinc-400">取貨地點</dt><dd className="font-medium">{order.pickupName}</dd></div>
        <div><dt className="text-sm text-zinc-600 dark:text-zinc-400">取貨地址</dt><dd className="font-medium">{order.pickupAddress}</dd></div>
        <div><dt className="text-sm text-zinc-600 dark:text-zinc-400">取貨開始</dt><dd className="font-medium">{formatOptionalDate(order.pickupStartAt)}</dd></div>
        <div><dt className="text-sm text-zinc-600 dark:text-zinc-400">取貨結束</dt><dd className="font-medium">{formatOptionalDate(order.pickupEndAt)}</dd></div>
      </dl>

      <section aria-labelledby="admin-order-items-heading" className="mt-8">
        <h3 id="admin-order-items-heading" className="text-xl font-semibold">訂單商品</h3>
        <ul className="mt-4 divide-y divide-zinc-200 rounded-md border border-zinc-300 dark:divide-zinc-800 dark:border-zinc-700">
          {order.items.map((item, index) => (
            <li key={`${item.productName}-${item.unit}-${index}`} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="font-semibold">{item.productName}</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{twdFormatter.format(item.unitPrice)}／{item.unit} × {item.quantity}</p>
              </div>
              <p className="font-semibold">{twdFormatter.format(item.lineSubtotal)}</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-right text-xl font-semibold">訂單總額：{twdFormatter.format(order.totalAmount)}</p>
      {order.status === "PLACED" && order.pickedUpAt === null && (
        <section aria-labelledby="admin-pickup-heading" className="mt-8 space-y-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <h3 id="admin-pickup-heading" className="text-xl font-semibold">取貨完成</h3>
          <AdminPickupOrderForm publicCode={order.publicCode} />
        </section>
      )}
      {order.status === "PLACED" && order.pickedUpAt === null && (
        <section aria-labelledby="admin-cancellation-heading" className="mt-8 space-y-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <h3 id="admin-cancellation-heading" className="text-xl font-semibold">取消訂單</h3>
          <AdminCancelOrderForm publicCode={order.publicCode} />
        </section>
      )}
    </section>
  );
}
