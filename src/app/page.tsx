import Link from "next/link";
import { CustomerPageShell } from "@/app/group-buys/public-ui";
import { StorefrontCover } from "@/app/storefront-cover";
import { StorefrontSearchForm } from "@/app/storefront-search";
import { StorefrontBrowser } from "@/app/storefront-browser";
import { listStorefront } from "@/lib/commerce/public";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";
import { formatTaipeiDisplayDateTime } from "@/lib/group-buys/time";
import { messageStyles, buttonStyles, fieldStyles, linkStyles, ErrorNotice, titleStyles } from "@/components/consumer/ui/primitives";

export const dynamic = "force-dynamic";
type Storefront = Awaited<ReturnType<typeof listStorefront>>;

function Cards({ groups }: { groups: Storefront["cards"] }) {
  const now = new Date();
  return <ul className="qbuy-storefront-grid mt-4">{groups.map((g) => <li key={g.id} className="min-w-0">
    <Link className={`${linkStyles.card} qbuy-storefront-card`} href={`/group-buys/${g.slug}`} aria-labelledby={`group-${g.id}`}>
      <StorefrontCover key={g.image} url={g.image} title={g.title} />
      <div className="qbuy-storefront-card-info">
        <h3 id={`group-${g.id}`} title={g.title} className="qbuy-storefront-card-title line-clamp-2">{g.title}</h3>
        {g.minPrice !== null && <p className="qbuy-storefront-price whitespace-nowrap text-xl font-bold">NT${g.minPrice.toLocaleString("zh-TW")}{g.priceVaries && <span className="ml-1 text-xs font-normal">起</span>}</p>}
        <p className="qbuy-storefront-deadline text-xs text-stone-500">截止 <time dateTime={g.endAt.toISOString()} title={formatTaipeiDisplayDateTime(g.endAt)}>{formatTaipeiDisplayDateTime(g.endAt).slice(5)}</time></p>
        {(g.endAt <= now || g.startAt > now || g.soldOut) && <p className="text-xs text-stone-600">{g.endAt <= now ? "已截止" : g.startAt > now ? "尚未開始" : "售完"}</p>}
        <span className="qbuy-storefront-card-action">查看團購 <span aria-hidden="true">→</span></span>
      </div>
    </Link>
  </li>)}</ul>;
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const q = await searchParams;
  const text = (v: string | string[] | undefined) => typeof v === "string" ? v : undefined;
  const query = { q: text(q.q), category: text(q.category), view: text(q.view) };
  const filterUrl = (change: Partial<typeof query>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, ...change })) if (value) params.set(key, value);
    return params.size ? `/?${params}` : "/";
  };
  const [store, customerAccount] = await Promise.all([listStorefront(query).catch(() => null), getCurrentCustomerAccount()]);
  const lineMessages: Record<string, string> = { denied: "LINE 登入已取消。", invalid_state: "LINE 登入驗證已失效，請重新嘗試。", token_exchange_failed: "LINE 登入暫時失敗，請稍後再試。", id_token_verification_failed: "無法驗證 LINE 登入，請重新嘗試。", login_failed: "登入失敗，請稍後再試。" };
  const lineMessage = lineMessages[text(q.line_login) ?? ""];
  const view = query.view === "ended" || query.view === "featured" ? query.view : undefined;
  const hasSearch = Boolean(query.q?.trim());
  const hasFilters = hasSearch || Boolean(query.category);
  const categoryName = store?.categories.find(category => category.id === query.category)?.name;
  return <CustomerPageShell customerAccount={customerAccount} compact storefrontQuery={query}>
    {lineMessage && <p role="alert" className={`mb-4 ${messageStyles.error}`}>{lineMessage}</p>}
    <section aria-label="搜尋團購" className="qbuy-storefront-intro">
      <h1 className={titleStyles.page}>找團購</h1>
      <p className="mt-1.5 text-sm leading-6 text-stone-600">精選正在開團的好物，直接搜尋或從分類開始。</p>
      <div className="mt-4 hidden sm:block"><StorefrontSearchForm key={JSON.stringify(query)} query={query} /></div>
      {hasSearch && <div className="mt-3 flex min-w-0 items-center justify-between gap-2 text-sm sm:hidden"><p className="min-w-0 break-words text-stone-600">搜尋：{query.q}</p>{Boolean(store?.cards.length) && <Link className={`${buttonStyles.header} shrink-0`} href={filterUrl({ q: undefined })}>清除搜尋</Link>}</div>}
    </section>
    {store ? <StorefrontBrowser query={query} categories={store.categories}>
      <section aria-label="商品列表" data-category={query.category ?? ""} className="mt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h2 className={titleStyles.section}>{view === "ended" ? "已結束團購" : view === "featured" ? "精選團購" : "正在開團"}{categoryName ? ` · ${categoryName}` : ""}</h2><p className="mt-1 text-sm text-stone-500">{store.cards.length} 個團購{view === "ended" ? "已結束" : "可加入"}</p></div>
          <label className="flex shrink-0 items-center gap-1.5 text-sm text-stone-600"><span className="hidden sm:inline">排序</span><select aria-label="排序" className={`${fieldStyles} w-auto`} defaultValue={view === "featured" ? "featured" : "latest"}>
            {view === "featured" ? <option value="featured">精選順序</option> : <option value="latest">最新上架</option>}
          </select></label>
        </div>
        {store.cards.length ? <Cards groups={store.cards} /> : <div className="py-10 text-center">
          <p className="font-semibold text-stone-800">{hasFilters ? "找不到符合條件的團購" : view === "ended" ? "目前沒有已結束的團購" : "目前沒有開放中的團購"}</p>
          <p className="mt-2 text-sm text-stone-600">{hasFilters ? "請嘗試其他關鍵字或分類。" : "新的團購正在準備中。"}</p>
          {hasFilters && <Link className={`mt-4 ${buttonStyles.storefrontOutline}`} href={filterUrl(hasSearch ? { q: undefined } : { category: undefined })}>{hasSearch ? "清除搜尋" : "回到全部"}</Link>}
        </div>}
      </section>
    </StorefrontBrowser> : <div className="mt-6"><ErrorNotice>無法載入團購，請稍後再試。<Link href="/" className={`ml-2 ${buttonStyles.storefrontOutline}`}>重新載入商城</Link></ErrorNotice></div>}
  </CustomerPageShell>;
}
