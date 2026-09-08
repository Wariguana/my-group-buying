import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { listGroupBuys } from "@/lib/group-buys/service";
import { taipeiDisplayFormatter } from "@/lib/group-buys/time";

const statusLabels = { DRAFT: "草稿", PUBLISHED: "已發布", CANCELLED: "已取消" } as const;

export default async function GroupBuysPage() {
  await requireAdmin();
  const result = await listGroupBuys();
  return <section><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-2xl font-semibold">團購管理</h2><Link href="/admin/group-buys/new" className="rounded-md bg-foreground px-4 py-2 font-medium text-background">新增團購草稿</Link></div>
    {!result.ok ? <p role="alert" className="mt-8 rounded-md border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">無法載入團購，請稍後再試。</p> : result.value.length === 0 ? <div className="mt-8 rounded-md border border-dashed border-zinc-400 p-8 text-center"><p className="text-zinc-600 dark:text-zinc-400">目前尚無團購資料。</p><Link href="/admin/group-buys/new" className="mt-4 inline-block font-medium underline underline-offset-4">新增第一筆團購草稿</Link></div> : <ul className="mt-8 space-y-4">{result.value.map((groupBuy) => <li key={groupBuy.id} className="rounded-md border border-zinc-300 p-5 dark:border-zinc-700"><div className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{groupBuy.title}</h3><span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium dark:bg-zinc-800">{statusLabels[groupBuy.status]}</span></div><p>訂購期間：{taipeiDisplayFormatter.format(groupBuy.startAt)}－{taipeiDisplayFormatter.format(groupBuy.endAt)}</p><p className="text-sm text-zinc-600 dark:text-zinc-400">商品 {groupBuy._count.items} 項／取貨地點 {groupBuy._count.pickups} 處</p></div>{groupBuy.status === "DRAFT" && <Link href={`/admin/group-buys/${groupBuy.id}/edit`} className="rounded-md border border-zinc-400 px-3 py-1.5 text-sm font-medium">編輯草稿</Link>}</div></li>)}</ul>}
  </section>;
}
