import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { listGroupBuys } from "@/lib/group-buys/service";
import { taipeiDisplayFormatter } from "@/lib/group-buys/time";
import { EmptyState, ErrorNotice, PageHeader, buttonStyles } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";

function presentation(status: "DRAFT" | "PUBLISHED" | "CANCELLED", startAt: Date, endAt: Date, now: Date) {
  if (status === "DRAFT") return { label: "草稿", tone: "slate" as const };
  if (status === "CANCELLED") return { label: "已取消", tone: "red" as const };
  if (now < startAt) return { label: "已發布 · 尚未開始", tone: "blue" as const };
  if (now <= endAt) return { label: "已發布 · 進行中", tone: "green" as const };
  return { label: "已發布 · 已結束", tone: "slate" as const };
}

export default async function GroupBuysPage() {
  await requireAdmin();
  const result = await listGroupBuys();
  const now = new Date();
  return (
    <section>
      <PageHeader eyebrow="Group buys" title="團購管理" description="建立與發布團購，安排販售商品及取貨資訊。" actions={<Link href="/admin/group-buys/new" className={buttonStyles.primary}>新增團購草稿</Link>} />
      <div className="mt-7">
        {!result.ok ? <ErrorNotice>無法載入團購，請稍後再試。</ErrorNotice> : result.value.length === 0 ? (
          <EmptyState title="目前尚無團購資料。" description="先建立一筆草稿，再加入商品與取貨地點。" action={<Link href="/admin/group-buys/new" className={buttonStyles.primary}>新增第一筆團購草稿</Link>} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <ul className="divide-y divide-slate-200">
              {result.value.map((groupBuy) => {
                const badge = presentation(groupBuy.status, groupBuy.startAt, groupBuy.endAt, now);
                return <li key={groupBuy.id} className="p-5 sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-slate-950">{groupBuy.title}</h2><StatusBadge tone={badge.tone}>{badge.label}</StatusBadge></div>
                    <p className="mt-2 text-sm text-slate-600">訂購期間：{taipeiDisplayFormatter.format(groupBuy.startAt)}－{taipeiDisplayFormatter.format(groupBuy.endAt)}</p>
                    <p className="mt-2 text-xs font-medium text-slate-500">商品 {groupBuy._count.items} 項／取貨地點 {groupBuy._count.pickups} 處</p>
                  </div>
                  {groupBuy.status === "DRAFT" ? <Link href={`/admin/group-buys/${groupBuy.id}/edit`} className={buttonStyles.secondary}>編輯草稿</Link> : groupBuy.status === "PUBLISHED" ? <Link href={`/admin/group-buys/${groupBuy.id}/edit`} className={buttonStyles.secondary}>編輯</Link> : <span className="text-sm text-slate-500">不可編輯</span>}
                </div></li>;
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
