import Link from "next/link";
import {
  CoverImage,
  CustomerPageShell,
  LifecycleBadge,
  OrderingPeriod,
} from "@/app/group-buys/public-ui";
import { listPublicGroupBuys } from "@/lib/group-buys/public-service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await listPublicGroupBuys(new Date());

  return (
    <CustomerPageShell>
        <div className="rounded-3xl bg-amber-100/60 px-6 py-10 sm:px-10 sm:py-14">
          <p className="text-xs font-bold tracking-[0.2em] text-amber-900">GOOD NEIGHBOR GROUP BUY</p>
          <h1 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight text-stone-950 sm:text-5xl">一起買，日常更簡單</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-stone-700">查看正在進行與近期的團購，選好商品與取貨地點即可完成訂購。</p>
        </div>

        <div className="mt-10 flex items-end justify-between gap-4">
          <div><p className="text-sm font-bold text-amber-800">團購列表</p><h2 className="mt-1 text-2xl font-bold tracking-tight">選擇你想參加的團購</h2></div>
        </div>
        {!result.ok ? (
          <p role="alert" className="mt-10 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
            無法載入團購，請稍後再試。
          </p>
        ) : result.value.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-600">
            目前沒有可查看的團購。
          </div>
        ) : (
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {result.value.map((groupBuy) => (
              <li key={groupBuy.id} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <CoverImage url={groupBuy.coverImageUrl} title={groupBuy.title} />
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex min-h-14 items-start justify-between gap-3">
                    <h2 className="text-xl font-bold leading-7">{groupBuy.title}</h2>
                    <LifecycleBadge lifecycle={groupBuy.lifecycle} />
                  </div>
                  <div className="mt-4 text-sm leading-6 text-stone-600">
                    <OrderingPeriod startAt={groupBuy.startAt} endAt={groupBuy.endAt} />
                  </div>
                  <p className="mt-4 line-clamp-3 min-h-[5.25rem] leading-7 text-stone-700">{groupBuy.description ?? ""}</p>
                  <Link
                    href={`/group-buys/${groupBuy.slug}`}
                    className="mt-auto inline-flex min-h-10 w-fit items-center rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2"
                  >
                    查看團購
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
    </CustomerPageShell>
  );
}
