import { messageStyles, buttonStyles, titleStyles } from "@/components/consumer/ui/primitives";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  CustomerPageShell,
  LifecycleBadge,
  LifecycleMessage,
  OrderingPeriod,
} from "@/app/group-buys/public-ui";
import { GroupBuyGallery } from "./group-buy-gallery";
import { getPublicGroupBuyBySlug } from "@/lib/group-buys/public-service";
import { getSevenElevenStoreSelectionForPage } from "@/lib/logistics/store-selection";
import { STORE_SELECTION_BINDING_COOKIE } from "@/lib/logistics/store-selection-cookie";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";
import { publicOffers } from "@/lib/commerce/public";
import { SkuPicker } from "./sku-picker";

export const dynamic = "force-dynamic";

export default async function PublicGroupBuyDetailPage({
  params,
  searchParams,
}: PageProps<"/group-buys/[slug]">) {
  const { slug } = await params;
  const query = await searchParams;
  const [result, customerAccount, offers] = await Promise.all([
    getPublicGroupBuyBySlug(slug, new Date()),
    getCurrentCustomerAccount(),
    publicOffers(slug),
  ]);
  if (!result.ok && result.error === "NOT_FOUND") notFound();
  const allowsSevenEleven = result.ok && result.value.allowsSevenEleven;
  const selectionToken = allowsSevenEleven && typeof query.storeSelection === "string" ? query.storeSelection : null;
  const browserBinding = selectionToken ? (await cookies()).get(STORE_SELECTION_BINDING_COOKIE)?.value : undefined;
  const selectedStore = result.ok && selectionToken && browserBinding
    ? await getSevenElevenStoreSelectionForPage(slug, selectionToken, browserBinding)
    : null;
  const selectionError = allowsSevenEleven && (query.storeSelectionError === "unavailable"
    || (selectionToken !== null && selectedStore === null));

  return (
    <CustomerPageShell customerAccount={customerAccount} width="max-w-7xl">
      {selectedStore && selectionToken && <Link className={`mb-4 ${buttonStyles.primary}`} href={`/checkout?selectionToken=${encodeURIComponent(selectionToken)}`}>使用 {selectedStore.name} 返回跨團結帳</Link>}
        {!result.ok ? (
          <p role="alert" className={messageStyles.error}>
            無法載入團購，請稍後再試。
          </p>
        ) : (
          <>
            <Link href="/" className={buttonStyles.secondary}>
              ← 返回團購列表
            </Link>
            <article className="mt-6 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
              <div
                data-testid="group-buy-hero"
                className="lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]"
              >
                <div data-testid="group-buy-gallery" className="min-w-0 overflow-hidden border-b border-line lg:self-start lg:border-r lg:border-b-0">
                  <GroupBuyGallery title={result.value.title} images={result.value.images} />
                </div>
                <div
                  data-testid="group-buy-overview"
                  className="space-y-5 p-4 sm:p-6 lg:flex lg:min-w-0 lg:flex-col lg:p-8"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <h1 data-testid="group-buy-title" className={`min-w-0 ${titleStyles.page}`}>{result.value.title}</h1>
                    <LifecycleBadge lifecycle={result.value.lifecycle} />
                  </div>
                  {result.value.description && <p className="whitespace-pre-line text-base leading-7 text-stone-700">{result.value.description}</p>}
                  <div data-testid="ordering-period" className="rounded-xl border border-amber-200 bg-amber-50 p-4 leading-7 text-stone-700">
                    <OrderingPeriod startAt={result.value.startAt} endAt={result.value.endAt} />
                    <LifecycleMessage lifecycle={result.value.lifecycle} />
                  </div>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-stone-600">
                    <span>SKU 販售規格 {offers.length} 項</span>
                  </p>
                </div>
              </div>
              <div className="space-y-5 px-4 pb-4 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8">
                {offers.length > 0 && <SkuPicker offers={offers} />}
                {selectionError && <p role="alert" className={messageStyles.error}>無法使用這次的 7-ELEVEN 門市選擇，請重新選擇。</p>}
                {offers.length === 0 ? <p className="rounded-xl border border-line p-5 text-stone-700">目前沒有可供訂購的商品規格。</p> : <p className="rounded-xl bg-amber-50 p-4 text-sm">可跨團加入購物車。配送方式依商品規格與溫層確認，結帳時會逐組列出運費與等待截止時間。</p>}

              </div>
            </article>
          </>
        )}
    </CustomerPageShell>
  );
}
