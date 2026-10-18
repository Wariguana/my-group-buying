import Link from "next/link";
import { CoverImage, CustomerPageShell, LifecycleBadge, OrderingPeriod } from "@/app/group-buys/public-ui";
import { listStorefront } from "@/lib/commerce/public";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";

export const dynamic = "force-dynamic";
type Storefront = Awaited<ReturnType<typeof listStorefront>>;
function Cards({ groups }: { groups: Storefront["cards"] }) {
  return <ul className="my-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{groups.map((g) => <li key={g.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
    <CoverImage url={g.image} title={g.title} /><div className="space-y-3 p-5"><h3 className="text-xl font-bold">{g.title}</h3>
      <LifecycleBadge lifecycle={g.endAt <= new Date() ? "ended" : g.startAt > new Date() ? "scheduled" : "active"} />
      {g.soldOut && g.endAt > new Date() && <span className="ml-2 text-red-800">售完</span>}
      <p className="text-sm text-stone-600">{g.category ?? "未分類"}</p><p className="line-clamp-3">{g.description}</p><OrderingPeriod startAt={g.startAt} endAt={g.endAt} />
      <Link className="inline-block rounded-lg bg-stone-900 px-4 py-2 text-white" href={`/group-buys/${g.slug}`}>查看團購</Link>
    </div></li>)}</ul>;
}
export default async function HomePage({ searchParams }: PageProps<"/">) {
  const q = await searchParams;
  const text = (v: string | string[] | undefined) => typeof v === "string" ? v : undefined;
  const query = { q: text(q.q), category: text(q.category), view: text(q.view) };
  const [store, customerAccount] = await Promise.all([listStorefront(query).catch(() => null), getCurrentCustomerAccount()]);
  const lineMessages: Record<string, string> = { denied: "LINE 登入已取消。", invalid_state: "LINE 登入驗證已失效，請重新嘗試。", token_exchange_failed: "LINE 登入暫時失敗，請稍後再試。", id_token_verification_failed: "無法驗證 LINE 登入，請重新嘗試。", login_failed: "登入失敗，請稍後再試。" };
  const lineMessage = lineMessages[text(q.line_login) ?? ""];
  return <CustomerPageShell customerAccount={customerAccount}>
    {lineMessage && <p role="alert" className="mb-6 rounded-xl bg-amber-50 p-4">{lineMessage}</p>}
    <div className="rounded-3xl bg-amber-100/60 px-6 py-10 sm:px-10"><p className="font-bold tracking-widest text-amber-900">QBUY 快易購</p><h1 className="mt-4 text-4xl font-bold">一起買，日常更簡單</h1><p className="mt-4">精選好物，跨團一起選購。</p></div>
    <form className="my-6 flex gap-3" action="/"><label className="flex-1">搜尋商品<input className="block w-full rounded-lg border p-3" name="q" maxLength={120} defaultValue={query.q} placeholder="搜尋商品或開團" /></label><button className="self-end rounded-lg bg-stone-900 px-5 py-3 text-white">搜尋</button></form>
    <nav aria-label="商城導航" className="flex flex-wrap gap-4 border-b pb-4"><Link href="/">最新上架</Link><Link href="/?view=featured">更多精選</Link><Link href="/?view=ended">已結束</Link><Link href="/cart">購物車</Link><Link href="/my/orders">我的訂單</Link></nav>
    {store ? <>
      <nav aria-label="商品分類" className="my-5 flex flex-wrap gap-3"><Link href="/">全部分類</Link>{store.categories.map((c) => <Link className="rounded-full border bg-white px-4 py-2" key={c.id} href={`/?category=${c.id}`}>{c.name}</Link>)}</nav>
      {!query.q && !query.category && !query.view && <section><h2 className="mt-8 text-2xl font-bold">精選開團</h2>{store.featured.length ? <Cards groups={store.featured} /> : <p className="my-4">目前沒有可購買的精選開團。</p>}{store.extraFeatured && <Link className="underline" href="/?view=featured">更多精選 →</Link>}</section>}
      <section><h2 className="mt-8 text-2xl font-bold">{query.view === "ended" ? "已結束" : query.view === "featured" ? "更多精選" : query.q ? "搜尋結果" : "最新上架"}</h2>{store.cards.length ? <Cards groups={store.cards} /> : <p className="my-6">目前沒有符合條件的團購。</p>}</section>
    </> : <p role="alert" className="my-6 text-red-800">無法載入團購，請稍後再試。</p>}
  </CustomerPageShell>;
}
