import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  CoverImage,
  CustomerPageShell,
  LifecycleBadge,
  LifecycleMessage,
  OrderingPeriod,
} from "@/app/group-buys/public-ui";
import { PublicOrderForm } from "./order-form";
import { getPublicGroupBuyBySlug } from "@/lib/group-buys/public-service";
import { getSevenElevenStoreSelectionForPage } from "@/lib/logistics/store-selection";
import { STORE_SELECTION_BINDING_COOKIE } from "@/lib/logistics/store-selection-cookie";

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
  searchParams,
}: PageProps<"/group-buys/[slug]">) {
  const { slug } = await params;
  const query = await searchParams;
  const result = await getPublicGroupBuyBySlug(slug, new Date());
  if (!result.ok && result.error === "NOT_FOUND") notFound();
  const selectionToken = typeof query.storeSelection === "string" ? query.storeSelection : null;
  const browserBinding = (await cookies()).get(STORE_SELECTION_BINDING_COOKIE)?.value;
  const selectedStore = result.ok && selectionToken && browserBinding
    ? await getSevenElevenStoreSelectionForPage(slug, selectionToken, browserBinding)
    : null;
  const selectionError = query.storeSelectionError === "unavailable"
    || (selectionToken !== null && selectedStore === null);
  const canOrder = result.ok
    && result.value.lifecycle === "active"
    && result.value.items.length > 0
    && ((result.value.allowsSelfPickup && result.value.pickups.length > 0) || result.value.allowsSevenEleven);
  const fulfillmentMethods = result.ok ? [
    result.value.allowsSelfPickup && result.value.pickups.length > 0 ? "指定地點自取" : null,
    result.value.allowsSevenEleven ? "7-ELEVEN 門市取貨" : null,
  ].filter((method): method is string => method !== null) : [];

  return (
    <CustomerPageShell width="max-w-7xl">
        {!result.ok ? (
          <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
            無法載入團購，請稍後再試。
          </p>
        ) : (
          <>
            <Link href="/" className="text-sm font-semibold text-amber-800 hover:underline">
              ← 返回團購列表
            </Link>
            <article className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div
                data-testid="group-buy-hero"
                className={result.value.coverImageUrl ? "lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]" : ""}
              >
                {result.value.coverImageUrl && (
                  <div data-testid="group-buy-cover" className="overflow-hidden border-b border-stone-200 lg:self-start lg:border-r lg:border-b-0">
                    <CoverImage
                      url={result.value.coverImageUrl}
                      title={result.value.title}
                      fit="contain"
                      className="lg:aspect-auto lg:h-[clamp(420px,46vw,500px)]"
                    />
                  </div>
                )}
                <div
                  data-testid="group-buy-overview"
                  className={`space-y-6 p-6 sm:p-10 ${result.value.coverImageUrl ? "lg:flex lg:min-w-0 lg:flex-col lg:justify-center" : "max-w-4xl"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <h1 data-testid="group-buy-title" className="min-w-0 text-3xl font-bold tracking-tight sm:text-4xl">{result.value.title}</h1>
                    <LifecycleBadge lifecycle={result.value.lifecycle} />
                  </div>
                  {result.value.description && <p className="whitespace-pre-line text-lg leading-8 text-stone-700">{result.value.description}</p>}
                  <div data-testid="ordering-period" className="rounded-xl border border-amber-200 bg-amber-50 p-4 leading-7 text-stone-700">
                    <OrderingPeriod startAt={result.value.startAt} endAt={result.value.endAt} />
                    <LifecycleMessage lifecycle={result.value.lifecycle} />
                  </div>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-stone-600">
                    <span>{result.value.items.length} 項商品</span>
                    {fulfillmentMethods.length > 0 && (
                      <>
                        <span aria-hidden="true" className="text-stone-300">•</span>
                        <span>{fulfillmentMethods.join("、")}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div className="space-y-6 px-6 pb-6 sm:px-10 sm:pb-10">
                {selectionError && !canOrder && (
                  <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
                    無法使用這次的 7-ELEVEN 門市選擇，請重新選擇。
                  </p>
                )}

                {!canOrder && <section aria-labelledby="products-heading" className="border-t border-stone-200 pt-8">
                  <h2 id="products-heading" className="text-2xl font-bold">團購商品</h2>
                  {result.value.items.length === 0 ? (
                    <p className="mt-5 rounded-xl bg-stone-100 p-5 text-stone-600">目前沒有可供訂購的商品。</p>
                  ) : (
                    <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                      {result.value.items.map((item) => (
                        <li key={item.id} className="rounded-xl border border-stone-200 p-5">
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
                </section>}

                {!canOrder && <section aria-labelledby="pickups-heading" className="border-t border-stone-200 pt-8">
                  <h2 id="pickups-heading" className="text-2xl font-bold">取貨方式</h2>
                  <p className="mt-3 text-stone-600">
                    {result.value.allowsSelfPickup && result.value.pickups.length > 0 && "指定地點自取"}
                    {result.value.allowsSelfPickup && result.value.pickups.length > 0 && result.value.allowsSevenEleven && "、"}
                    {result.value.allowsSevenEleven && "7-ELEVEN 門市取貨"}
                    {result.value.allowsSelfPickup && result.value.pickups.length === 0 && !result.value.allowsSevenEleven && "目前沒有可用的取貨地點。"}
                  </p>
                </section>}
                {canOrder && (
                    <PublicOrderForm
                      slug={result.value.slug}
                      items={result.value.items.map((item) => ({
                        id: item.id,
                        salePrice: item.salePrice,
                        stock: item.stock,
                        purchaseLimit: item.purchaseLimit,
                        product: item.product,
                      }))}
                      pickups={result.value.pickups.map((pickup) => ({
                        id: pickup.id,
                        pickupStartAt: pickup.pickupStartAt,
                        pickupEndAt: pickup.pickupEndAt,
                        pickupLocation: pickup.pickupLocation,
                      }))}
                      allowsSelfPickup={result.value.allowsSelfPickup}
                      allowsSevenEleven={result.value.allowsSevenEleven}
                      storeSelectionReturn={selectionToken !== null || query.storeSelectionError === "unavailable"}
                      storeSelectionError={selectionError}
                      selectedSevenElevenStore={selectedStore && selectionToken ? { ...selectedStore, selectionToken } : null}
                    />
                  )}
              </div>
            </article>
          </>
        )}
    </CustomerPageShell>
  );
}
