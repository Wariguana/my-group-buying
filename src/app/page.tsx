import Link from "next/link";
import { CoverImage, CustomerPageShell, LifecycleBadge, OrderingPeriod } from "@/app/group-buys/public-ui";
import { listStorefront } from "@/lib/commerce/public";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";
import { buttonStyles, fieldStyles, EmptyState, ErrorNotice } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";
type Storefront = Awaited<ReturnType<typeof listStorefront>>;
function Cards({ groups }: { groups: Storefront["cards"] }) {
  return <ul className="my-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{groups.map((g) => <li key={g.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
    <CoverImage url={g.image} title={g.title} /><div className="space-y-3 p-5"><h3 className="text-xl font-bold">{g.title}</h3>
      <LifecycleBadge lifecycle={g.endAt <= new Date() ? "ended" : g.startAt > new Date() ? "scheduled" : "active"} />
      {g.soldOut && g.endAt > new Date() && <span className="ml-2 text-red-800">售完</span>}
      <p className="text-sm text-stone-600">{g.category ?? "未分類"}</p><p className="line-clamp-3">{g.description}</p><OrderingPeriod startAt={g.startAt} endAt={g.endAt} />
      <Link className={buttonStyles.primary} href={`/group-buys/${g.slug}`}>查看團購</Link>
    </div></li>)}</ul>;
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
  return <CustomerPageShell customerAccount={customerAccount}>
    {lineMessage && <p role="alert" className="mb-6 rounded-xl bg-amber-50 p-4">{lineMessage}</p>}
    <div className="rounded-3xl bg-amber-100/60 px-6 py-10 sm:px-10"><p className="font-bold tracking-widest text-amber-900">QBUY 快易購</p><h1 className="mt-4 text-4xl font-bold">一起買，日常更簡單</h1><p className="mt-4">精選好物，跨團一起選購。</p></div>
    <form className="my-6 flex gap-3" action="/"><input type="hidden" name="category" value={query.category ?? ""}/><input type="hidden" name="view" value={query.view ?? ""}/><label className="min-w-0 flex-1">搜尋商品<input className={fieldStyles} name="q" maxLength={120} defaultValue={query.q} placeholder="搜尋商品或開團" /></label><button className={`${buttonStyles.primary} self-end`}>搜尋</button></form>
    <nav aria-label="商城導航" className="flex flex-wrap gap-2 border-b pb-4">{[[undefined, "最新上架"], ["featured", "更多精選"], ["ended", "已結束"]].map(([view, label]) => <Link key={label} href={filterUrl({ view })} aria-current={query.view === view ? "page" : undefined} className={query.view === view ? buttonStyles.primary : buttonStyles.secondary}>{label}</Link>)}<Link className={buttonStyles.textAction} href="/cart">購物車</Link><Link className={buttonStyles.textAction} href="/my/orders">我的訂單</Link></nav>
    {store ? <>
      <nav aria-label="商品分類" className="my-5 flex flex-wrap gap-3"><Link className={buttonStyles.secondary} aria-current={!query.category ? "page" : undefined} href={filterUrl({ category: undefined })}>全部分類</Link>{store.categories.map((c) => <Link aria-current={query.category === c.id ? "page" : undefined} className={query.category === c.id ? buttonStyles.primary : buttonStyles.secondary} key={c.id} href={filterUrl({ category: c.id })}>{c.name}</Link>)}</nav>
      {!query.q && !query.category && !query.view && <section><h2 className="mt-8 text-2xl font-bold">精選開團</h2>{store.featured.length ? <Cards groups={store.featured} /> : <p className="my-4">目前沒有可購買的精選開團。</p>}{store.extraFeatured && <Link className="underline" href="/?view=featured">更多精選 →</Link>}</section>}
      <section><h2 className="my-6 text-2xl font-bold">{query.view === "ended" ? "已結束" : query.view === "featured" ? "更多精選" : query.q ? "搜尋結果" : "最新上架"}</h2>{store.cards.length ? <Cards groups={store.cards} /> : <EmptyState title="目前沒有符合條件的團購。" description="可以調整搜尋詞或分類，再找找喜歡的商品。" action={<Link className={buttonStyles.secondary} href="/">清除篩選條件</Link>}/>}</section>
    </> : <ErrorNotice>無法載入團購，請稍後再試。<Link href="/" className="ml-2 underline">重新載入商城</Link></ErrorNotice>}
  </CustomerPageShell>;
}
