import { titleStyles, buttonStyles, fieldStyles, disclosureStyles, linkStyles, EmptyState } from "@/components/consumer/ui/primitives";
import Link from "next/link";
import { listMyCheckouts } from "@/lib/checkout/queries";
import { checkoutLabels } from "@/lib/checkout/presentation";
import { redirect } from "next/navigation";
import { CustomerPageShell } from "@/app/group-buys/public-ui";
import { OrderStatusBadge } from "@/components/consumer/ui/status-badge";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";
import { taipeiDisplayFormatter } from "@/lib/group-buys/time";
import { listMyOrders } from "@/lib/orders/my-orders-service";
import { labels as deliveryLabels } from "@/lib/qbuy/domain";

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

export default async function MyOrdersPage({searchParams}: {searchParams?: Promise<{q?:string;page?:string}>} = {}) {
  const query=await searchParams??{}; const page=Math.max(1,Math.min(10000,Math.floor(Number(query.page)||1))); const q=typeof query.q==="string"?query.q.slice(0,100):"";
  const customerAccount = await getCurrentCustomerAccount();
  if (!customerAccount) redirect("/");

  const orders = await listMyOrders(customerAccount.id);
  const checkouts = await listMyCheckouts(customerAccount.id, {q,page});

  return (
    <CustomerPageShell customerAccount={customerAccount} width="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">My orders</p>
          <h1 className={`mt-2 ${titleStyles.page}`}>我的訂單</h1>
          <p className="mt-2 text-stone-600">只顯示你在 LINE 登入狀態下建立的訂單。</p>
        </div>
        <Link href="/" className={buttonStyles.secondary}>返回團購列表</Link>
      </div>

      <form aria-label="搜尋我的訂單" className="mt-5 flex gap-3"><input name="q" defaultValue={q} aria-label="搜尋 QB 訂單編號" placeholder="搜尋 QB 訂單編號" className={`min-w-0 flex-1 ${fieldStyles}`}/><button className={buttonStyles.primary}>搜尋</button></form><nav aria-label="我的訂單分頁" className="mt-3 flex gap-3">{page>1&&<Link className={buttonStyles.secondary} href={`/my/orders?q=${encodeURIComponent(q)}&page=${page-1}`}>上一頁</Link>}{checkouts.length===20&&<Link className={buttonStyles.secondary} href={`/my/orders?q=${encodeURIComponent(q)}&page=${page+1}`}>下一頁</Link>}</nav><section className="mt-6 space-y-4" aria-label="跨團購買紀錄">
        {q && !checkouts.length && <EmptyState title="目前沒有符合條件的購買紀錄" action={<Link className={buttonStyles.secondary} href="/my/orders">清除搜尋條件</Link>}/>}
        {checkouts.map(c => <article key={c.id} className="space-y-4 rounded-xl border border-line bg-white p-5 shadow-sm">
          <h2 className={titleStyles.card}>本次購買 · {checkoutLabels[c.status]} · NT${c.totalAmount}</h2>
          <p className="text-xs text-stone-500"><time dateTime={c.createdAt.toISOString()}>{taipeiDisplayFormatter.format(c.createdAt)}</time></p>
          {c.orders.length > 0 && <p>{c.orders.map(o=>o.orderNumber).join("／")}</p>}
          <div className="flex flex-wrap gap-3">
            <Link className={buttonStyles.secondary} href={`/checkout/${c.id}`}>查看本次購買</Link>
            <Link className={buttonStyles.secondary} href={`/my/orders/${c.id}`}>取消申請、退款與配送進度</Link>
          </div>
          <details><summary className={disclosureStyles}>商品、團別及出貨群組</summary><div className="space-y-2">{c.items.map(i=><p key={i.id}>{i.groupTitle}／{i.productName} × {i.quantity} · NT${i.unitPrice*i.quantity}</p>)}{c.fulfillmentGroups.map(g=><p key={g.id}>{deliveryLabels[g.method] ?? "配送方式待確認"}／{deliveryLabels[g.temperature] ?? "溫層待確認"} · 運費 NT${g.shippingAmount}</p>)}</div></details>
        </article>)}
      </section>
      {orders.length === 0 && checkouts.length === 0 && !q ? (
        <section className="mt-8 rounded-xl border border-line bg-white p-8 text-center shadow-sm">
          <h2 className={titleStyles.card}>目前沒有訂單</h2>
          <p className="mt-2 text-stone-600">登入後新建立的訂單會顯示在這裡；過去的訪客訂單不會自動加入。</p>
          <Link href="/" className={`mt-5 ${buttonStyles.primary}`}>查看團購</Link>
        </section>
      ) : (
        <ul className="mt-8 space-y-4">
          {orders.map((order) => (
            <li key={order.publicCode}>
              <Link href={`/orders/${order.publicCode}`} className={`border border-line bg-white p-5 shadow-sm sm:p-6 ${linkStyles.card}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-stone-500">訂單編號</p>
                    <p className="mt-1 font-mono text-lg font-bold tracking-wide">{order.orderNumber}</p>
                    <h2 className={`mt-3 ${titleStyles.card}`}>{order.groupBuy.title}</h2>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </div>
                <dl className="mt-5 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-2">
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
