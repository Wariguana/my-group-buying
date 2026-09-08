import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CoverImage,
  LifecycleBadge,
  LifecycleMessage,
  OrderingPeriod,
  PublicHeader,
} from "@/app/group-buys/public-ui";
import { getPublicGroupBuyBySlug } from "@/lib/group-buys/public-service";
import { taipeiDisplayFormatter } from "@/lib/group-buys/time";

export const dynamic = "force-dynamic";

function formatPrice(value: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function stockText(stock: number | null): string {
  if (stock === null) return "不限量";
  if (stock === 0) return "已無庫存";
  return `剩餘 ${stock}`;
}

function purchaseLimitText(purchaseLimit: number | null): string {
  if (purchaseLimit === null) return "不限購";
  return `每人限購 ${purchaseLimit}`;
}

export default async function PublicGroupBuyDetailPage({
  params,
}: PageProps<"/group-buys/[slug]">) {
  const { slug } = await params;
  const result = await getPublicGroupBuyBySlug(slug, new Date());
  if (!result.ok && result.error === "NOT_FOUND") notFound();

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        {!result.ok ? (
          <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
            無法載入團購，請稍後再試。
          </p>
        ) : (
          <>
            <Link href="/" className="text-sm font-semibold text-amber-800 hover:underline">
              ← 返回團購列表
            </Link>
            <article className="mt-6 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
              {result.value.coverImageUrl && <CoverImage url={result.value.coverImageUrl} title={result.value.title} />}
              <div className="space-y-6 p-6 sm:p-10">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{result.value.title}</h1>
                  <LifecycleBadge lifecycle={result.value.lifecycle} />
                </div>
                {result.value.description && <p className="whitespace-pre-line text-lg leading-8 text-stone-700">{result.value.description}</p>}
                <div className="rounded-xl bg-amber-50 p-4 leading-7 text-stone-700">
                  <OrderingPeriod startAt={result.value.startAt} endAt={result.value.endAt} />
                  <LifecycleMessage lifecycle={result.value.lifecycle} />
                </div>

                <section aria-labelledby="products-heading" className="border-t border-stone-200 pt-8">
                  <h2 id="products-heading" className="text-2xl font-bold">團購商品</h2>
                  {result.value.items.length === 0 ? (
                    <p className="mt-5 rounded-xl bg-stone-100 p-5 text-stone-600">目前沒有可供訂購的商品。</p>
                  ) : (
                    <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                      {result.value.items.map((item, index) => (
                        <li key={`${item.sortOrder}-${index}`} className="rounded-xl border border-stone-200 p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-bold">{item.product.name}</h3>
                              <p className="mt-1 text-sm text-stone-500">{item.product.unit}</p>
                            </div>
                            <p className="text-lg font-bold text-amber-800">{formatPrice(item.salePrice)}</p>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2 text-sm">
                            <span className="rounded-full bg-stone-100 px-3 py-1">{stockText(item.stock)}</span>
                            <span className="rounded-full bg-stone-100 px-3 py-1">{purchaseLimitText(item.purchaseLimit)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section aria-labelledby="pickups-heading" className="border-t border-stone-200 pt-8">
                  <h2 id="pickups-heading" className="text-2xl font-bold">取貨地點</h2>
                  {result.value.pickups.length === 0 ? (
                    <p className="mt-5 rounded-xl bg-stone-100 p-5 text-stone-600">目前沒有可用的取貨地點。</p>
                  ) : (
                    <ul className="mt-5 space-y-4">
                      {result.value.pickups.map((pickup, index) => (
                        <li key={`${pickup.sortOrder}-${index}`} className="rounded-xl border border-stone-200 p-5">
                          <h3 className="font-bold">{pickup.pickupLocation.name}</h3>
                          <p className="mt-1 text-stone-600">{pickup.pickupLocation.address}</p>
                          <p className="mt-3 text-sm text-stone-600">
                            {pickup.pickupStartAt && pickup.pickupEndAt
                              ? `取貨時間：${taipeiDisplayFormatter.format(pickup.pickupStartAt)}－${taipeiDisplayFormatter.format(pickup.pickupEndAt)}`
                              : "取貨時間另行通知"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </article>
          </>
        )}
      </main>
    </div>
  );
}
