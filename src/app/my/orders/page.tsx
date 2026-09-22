import Link from "next/link";
import { redirect } from "next/navigation";
import { CustomerPageShell } from "@/app/group-buys/public-ui";
import { OrderStatusBadge } from "@/components/ui/status-badge";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";
import { taipeiDisplayFormatter } from "@/lib/group-buys/time";
import { listMyOrders } from "@/lib/orders/my-orders-service";

export const dynamic = "force-dynamic";

const price = (value: number) => new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
}).format(value);

function pickupSummary(order: Awaited<ReturnType<typeof listMyOrders>>[number]) {
  if (order.fulfillmentMethod === "SEVEN_ELEVEN") {
    return `7-ELEVEN ${order.sevenElevenStoreName ?? "門市"}${order.sevenElevenStoreId ? `（${order.sevenElevenStoreId}）` : ""}`;
  }
  return order.pickupName
    ? `自取：${order.pickupName}${order.pickupAddress ? `｜${order.pickupAddress}` : ""}`
    : "自取資訊另行通知";
}

export default async function MyOrdersPage() {
  const customerAccount = await getCurrentCustomerAccount();
  if (!customerAccount) redirect("/");

  const orders = await listMyOrders(customerAccount.id);

  return (
    <CustomerPageShell customerAccount={customerAccount} width="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">My orders</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">我的訂單</h1>
          <p className="mt-2 text-stone-600">只顯示你在 LINE 登入狀態下建立的訂單。</p>
        </div>
        <Link href="/" className="text-sm font-semibold text-amber-800 hover:underline">返回團購列表</Link>
      </div>

      {orders.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-bold">目前沒有訂單</h2>
          <p className="mt-2 text-stone-600">登入後新建立的訂單會顯示在這裡；過去的訪客訂單不會自動加入。</p>
          <Link href="/" className="mt-5 inline-flex rounded-lg bg-amber-800 px-4 py-2.5 font-semibold text-white hover:bg-amber-900">查看團購</Link>
        </section>
      ) : (
        <ul className="mt-8 space-y-4">
          {orders.map((order) => (
            <li key={order.publicCode}>
              <Link href={`/orders/${order.publicCode}`} className="block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-amber-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-stone-500">訂單編號</p>
                    <p className="mt-1 font-mono text-lg font-bold tracking-wide">{order.orderNumber}</p>
                    <h2 className="mt-3 text-xl font-bold">{order.groupBuy.title}</h2>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </div>
                <dl className="mt-5 grid gap-3 border-t border-stone-200 pt-4 text-sm sm:grid-cols-2">
                  <div><dt className="text-stone-500">總金額</dt><dd className="mt-1 font-bold text-stone-900">{price(order.totalAmount)}</dd></div>
                  <div><dt className="text-stone-500">建立時間</dt><dd className="mt-1 font-medium">{taipeiDisplayFormatter.format(order.createdAt)}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-stone-500">取貨資訊</dt><dd className="mt-1 font-medium">{pickupSummary(order)}</dd></div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CustomerPageShell>
  );
}
