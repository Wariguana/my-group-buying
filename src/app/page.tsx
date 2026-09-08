import Link from "next/link";
import {
  CoverImage,
  LifecycleBadge,
  OrderingPeriod,
  PublicHeader,
} from "@/app/group-buys/public-ui";
import { listPublicGroupBuys } from "@/lib/group-buys/public-service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await listPublicGroupBuys(new Date());

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <PublicHeader />
      <main className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold tracking-[0.18em] text-amber-800">GROUP BUY</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">一起買，日常更簡單</h1>
          <p className="mt-4 text-lg leading-8 text-stone-600">查看目前與過往團購的訂購期間、商品及取貨資訊。</p>
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
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {result.value.map((groupBuy) => (
              <li key={groupBuy.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                {groupBuy.coverImageUrl && <CoverImage url={groupBuy.coverImageUrl} title={groupBuy.title} />}
                <div className="space-y-4 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-xl font-bold leading-7">{groupBuy.title}</h2>
                    <LifecycleBadge lifecycle={groupBuy.lifecycle} />
                  </div>
                  <div className="text-sm leading-6 text-stone-600">
                    <OrderingPeriod startAt={groupBuy.startAt} endAt={groupBuy.endAt} />
                  </div>
                  {groupBuy.description && <p className="line-clamp-3 leading-7 text-stone-700">{groupBuy.description}</p>}
                  <Link
                    href={`/group-buys/${groupBuy.slug}`}
                    className="inline-flex rounded-lg bg-stone-900 px-4 py-2.5 font-semibold text-white hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2"
                  >
                    查看團購
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
