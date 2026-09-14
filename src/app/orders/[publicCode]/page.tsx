import Link from "next/link";
import { cookies } from "next/headers";
import { OrderAccessForm } from "./access-form";
import { CancelOrderForm } from "./cancel-form";
import { ORDER_ACCESS_COOKIE_NAME } from "@/lib/orders/access-cookie";
import { getOrderForAccess } from "@/lib/orders/access-service";
import { taipeiDisplayFormatter } from "@/lib/group-buys/time";

export const dynamic = "force-dynamic";

function formatPrice(value: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatOptionalDate(value: Date | null): string {
  return value ? taipeiDisplayFormatter.format(value) : "另行通知";
}

export default async function CustomerOrderPage({
  params,
}: Readonly<{ params: Promise<{ publicCode: string }> }>) {
  const { publicCode } = await params;
  const rawToken = (await cookies()).get(ORDER_ACCESS_COOKIE_NAME)?.value;
  const result = await getOrderForAccess(publicCode, rawToken);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <Link href="/" className="text-sm font-semibold text-amber-800 hover:underline">
          ← 返回團購列表
        </Link>
        <div className="mt-6">
          {!result.ok ? (
            <OrderAccessForm publicCode={publicCode} />
          ) : (
            <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-stone-500">訂單參考編號</p>
                  <h1 className="mt-1 text-2xl font-bold">{result.value.publicCode}</h1>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 font-bold text-emerald-900">
                  {result.value.status}
                </span>
              </div>

              <dl className="mt-6 grid gap-4 rounded-xl bg-stone-50 p-5 sm:grid-cols-2">
                <div><dt className="text-sm text-stone-500">訂購人</dt><dd className="font-medium">{result.value.customerName}</dd></div>
                <div><dt className="text-sm text-stone-500">手機</dt><dd className="font-medium">{result.value.customerPhone}</dd></div>
                <div><dt className="text-sm text-stone-500">取貨地點</dt><dd className="font-medium">{result.value.pickupName}</dd></div>
                <div><dt className="text-sm text-stone-500">地址</dt><dd className="font-medium">{result.value.pickupAddress}</dd></div>
                <div><dt className="text-sm text-stone-500">取貨開始</dt><dd className="font-medium">{formatOptionalDate(result.value.pickupStartAt)}</dd></div>
                <div><dt className="text-sm text-stone-500">取貨結束</dt><dd className="font-medium">{formatOptionalDate(result.value.pickupEndAt)}</dd></div>
                <div><dt className="text-sm text-stone-500">成立時間</dt><dd className="font-medium">{taipeiDisplayFormatter.format(result.value.createdAt)}</dd></div>
                {result.value.cancelledAt && <div><dt className="text-sm text-stone-500">取消時間</dt><dd className="font-medium">{taipeiDisplayFormatter.format(result.value.cancelledAt)}</dd></div>}
              </dl>

              <section aria-labelledby="order-items-heading" className="mt-8">
                <h2 id="order-items-heading" className="text-xl font-bold">訂單商品</h2>
                <ul className="mt-4 divide-y divide-stone-200 rounded-xl border border-stone-200">
                  {result.value.items.map((item, index) => (
                    <li key={`${item.productName}-${item.unit}-${index}`} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div>
                        <p className="font-bold">{item.productName}</p>
                        <p className="text-sm text-stone-600">{formatPrice(item.unitPrice)}／{item.unit} × {item.quantity}</p>
                      </div>
                      <p className="font-bold">{formatPrice(item.lineSubtotal)}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <p className="mt-6 text-right text-xl font-bold">訂單總額：{formatPrice(result.value.totalAmount)}</p>

              <section aria-labelledby="cancellation-heading" className="mt-8 border-t border-stone-200 pt-6">
                <h2 id="cancellation-heading" className="text-xl font-bold">取消訂單</h2>
                {result.value.status === "CANCELLED" ? (
                  <p role="status" className="mt-4 rounded-lg bg-stone-100 p-4 font-medium">
                    訂單已取消。取消時間：{taipeiDisplayFormatter.format(result.value.cancelledAt!)}
                  </p>
                ) : result.value.canCancel ? (
                  <div className="mt-4 space-y-4">
                    <p>可取消訂單，截止時間：<strong>{taipeiDisplayFormatter.format(result.value.cancellationDeadline)}</strong></p>
                    <CancelOrderForm publicCode={result.value.publicCode} />
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg bg-amber-50 p-4 font-medium text-amber-900">
                    此團購已截止，訂單無法自行取消。
                  </p>
                )}
              </section>
            </article>
          )}
        </div>
      </main>
    </div>
  );
}
