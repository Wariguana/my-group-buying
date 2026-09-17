import Link from "next/link";
import { cookies } from "next/headers";
import { CustomerPageShell } from "@/app/group-buys/public-ui";
import { OrderAccessForm } from "./access-form";
import { CancelOrderForm } from "./cancel-form";
import { ORDER_ACCESS_COOKIE_NAME } from "@/lib/orders/access-cookie";
import { getOrderForAccess } from "@/lib/orders/access-service";
import { taipeiDisplayFormatter } from "@/lib/group-buys/time";
import { OrderStatusBadge, PickupStatusBadge, StatusBadge } from "@/components/ui/status-badge";
import { deriveSelfPickupStatus, selfPickupStatusTone } from "./presentation";

export const dynamic = "force-dynamic";
const price = (value: number) => new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(value);
const optionalDate = (value: Date | null) => value ? taipeiDisplayFormatter.format(value) : "另行通知";

export default async function CustomerOrderPage({ params }: Readonly<{ params: Promise<{ publicCode: string }> }>) {
  const { publicCode } = await params;
  const rawToken = (await cookies()).get(ORDER_ACCESS_COOKIE_NAME)?.value;
  const result = await getOrderForAccess(publicCode, rawToken);
  const now = new Date();
  const selfPickupStatus = result.ok && result.value.fulfillmentMethod === "SELF_PICKUP"
    ? deriveSelfPickupStatus({
        pickedUpAt: result.value.pickedUpAt,
        pickupStartAt: result.value.pickupStartAt,
        pickupEndAt: result.value.pickupEndAt,
        now,
      })
    : null;

  return (
    <CustomerPageShell width="max-w-4xl">
      <Link href="/" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-stone-400 hover:bg-stone-100 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
        <span aria-hidden="true">←</span>
        返回團購列表
      </Link>
      <div className="mt-6">
        {!result.ok ? <OrderAccessForm publicCode={publicCode} /> : (
          <article className="space-y-5">
            <header className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">Order detail</p>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-stone-500">訂單編號</p><h1 className="mt-1 font-mono text-2xl font-bold tracking-wide sm:text-3xl">{result.value.orderNumber}</h1><p className="mt-3 text-sm text-stone-600">成立時間：{taipeiDisplayFormatter.format(result.value.createdAt)}</p></div><OrderStatusBadge status={result.value.status} /></div>
            </header>

            <div className="grid gap-5 sm:grid-cols-2">
              <section aria-labelledby="payment-heading" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="payment-heading" className="text-lg font-bold">收款狀態</h2>{result.value.status === "PLACED" && <StatusBadge tone={result.value.paidAt ? "green" : "amber"}>{result.value.paidAt ? "已收款" : "待收款"}</StatusBadge>}</div>
                {result.value.status === "PLACED" ? <><p className="mt-4 font-semibold text-stone-800">{result.value.paidAt ? "已完成收款" : "取貨時付款"}</p>{result.value.paidAt && <p className="mt-2 text-sm text-stone-600">收款確認時間：{taipeiDisplayFormatter.format(result.value.paidAt)}</p>}</> : <p className="mt-4 text-sm text-stone-600">此訂單已取消。</p>}
              </section>
              <section aria-labelledby="pickup-heading" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="pickup-heading" className="text-lg font-bold">取貨狀態</h2>{result.value.status === "PLACED" && (selfPickupStatus ? <StatusBadge tone={selfPickupStatusTone(selfPickupStatus)}>{selfPickupStatus}</StatusBadge> : <PickupStatusBadge pickedUpAt={result.value.pickedUpAt} />)}</div>
                {result.value.status === "PLACED" && result.value.pickedUpAt && <p className="mt-4 font-semibold text-stone-800">已取貨：{taipeiDisplayFormatter.format(result.value.pickedUpAt)}</p>}
                <p className={`${result.value.pickedUpAt ? "mt-2" : "mt-4"} text-sm font-semibold text-stone-800`}>取貨方式：{result.value.fulfillmentMethod === "SEVEN_ELEVEN" ? "7-ELEVEN 門市取貨" : "自取"}</p>
                {result.value.fulfillmentMethod !== "SEVEN_ELEVEN" ? <><p className="mt-2 font-semibold text-stone-800">{result.value.pickupName}</p><p className="mt-1 text-sm text-stone-600">{result.value.pickupAddress}</p><p className="mt-2 text-sm text-stone-600">{optionalDate(result.value.pickupStartAt)}－{optionalDate(result.value.pickupEndAt)}</p></> : <><p className="mt-2 font-semibold text-stone-800">門市：{result.value.sevenElevenStoreName}</p><p className="mt-1 text-sm text-stone-600">店號：{result.value.sevenElevenStoreId}</p><p className="mt-1 text-sm text-stone-600">地址：{result.value.sevenElevenStoreAddress}</p></>}
              </section>
            </div>

            <section aria-labelledby="customer-heading" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 id="customer-heading" className="text-lg font-bold">訂購資訊</h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2"><div><dt className="text-sm text-stone-500">訂購人</dt><dd className="mt-1 font-medium">{result.value.customerName}</dd></div><div><dt className="text-sm text-stone-500">手機</dt><dd className="mt-1 font-medium">{result.value.customerPhone}</dd></div>{result.value.cancelledAt && <div><dt className="text-sm text-stone-500">取消時間</dt><dd className="mt-1 font-medium">{taipeiDisplayFormatter.format(result.value.cancelledAt)}</dd></div>}</dl>
            </section>

            <section aria-labelledby="order-items-heading" className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="border-b border-stone-200 px-5 py-4 sm:px-6"><h2 id="order-items-heading" className="text-lg font-bold">訂單商品</h2></div>
              <ul className="divide-y divide-stone-200">{result.value.items.map((item, index) => <li key={`${item.productName}-${item.unit}-${index}`} className="grid gap-2 p-5 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-bold">{item.productName}</p><p className="mt-1 text-sm text-stone-600">{price(item.unitPrice)}／{item.unit} × {item.quantity}</p></div><p className="font-bold">{price(item.lineSubtotal)}</p></li>)}</ul>
              <div className="border-t border-stone-200 bg-amber-50 px-5 py-5 text-right sm:px-6"><p className="text-xl font-bold text-stone-950">訂單總額：{price(result.value.totalAmount)}</p></div>
            </section>

            <section aria-labelledby="cancellation-heading" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 id="cancellation-heading" className="text-lg font-bold">取消訂單</h2>
              {result.value.status === "CANCELLED" ? <p role="status" className="mt-4 rounded-lg bg-stone-100 p-4 font-medium">訂單已取消。取消時間：{taipeiDisplayFormatter.format(result.value.cancelledAt!)}</p> : result.value.pickedUpAt ? <p className="mt-4 rounded-lg bg-stone-100 p-4 font-medium">訂單已取貨，無法取消。</p> : result.value.paidAt ? <p className="mt-4 rounded-lg bg-stone-100 p-4 font-medium">訂單已確認收款，無法取消。</p> : result.value.canCancel ? <div className="mt-4 space-y-4"><p>可取消訂單，截止時間：<strong>{taipeiDisplayFormatter.format(result.value.cancellationDeadline)}</strong></p><CancelOrderForm publicCode={result.value.publicCode} /></div> : <p className="mt-4 rounded-lg bg-amber-50 p-4 font-medium text-amber-900">此團購已截止，訂單無法自行取消。</p>}
            </section>
          </article>
        )}
      </div>
    </CustomerPageShell>
  );
}
