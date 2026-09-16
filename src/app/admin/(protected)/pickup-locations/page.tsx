import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { listPickupLocations } from "@/lib/pickup-locations/service";
import { EmptyState, ErrorNotice, PageHeader, buttonStyles } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { deactivatePickupLocationAction, reactivatePickupLocationAction } from "./actions";
import { PickupLocationStatusForm } from "./status-form";

export default async function PickupLocationsPage({ searchParams }: PageProps<"/admin/pickup-locations">) {
  await requireAdmin();
  const [{ error }, result] = await Promise.all([searchParams, listPickupLocations()]);
  const statusError = error === "not-found" ? "找不到取貨地點。" : error === "failed" ? "狀態更新失敗，請稍後再試。" : null;

  return (
    <section>
      <PageHeader title="取貨地點管理" description="維護顧客可選擇的取貨地點與地址。" actions={<Link href="/admin/pickup-locations/new" className={buttonStyles.primary}>新增取貨地點</Link>} />
      <div className="mt-7 space-y-5">
        {statusError && <ErrorNotice>{statusError}</ErrorNotice>}
        {!result.ok ? <ErrorNotice>無法載入取貨地點，請稍後再試。</ErrorNotice> : result.value.length === 0 ? (
          <EmptyState title="目前尚無取貨地點資料。" description="建立地點後，即可加入團購的取貨安排。" action={<Link href="/admin/pickup-locations/new" className={buttonStyles.primary}>新增第一筆取貨地點</Link>} />
        ) : (
          <ul className="grid gap-4">
            {result.value.map((pickupLocation) => <li key={pickupLocation.id} className={`rounded-xl border p-5 shadow-sm ${pickupLocation.isActive ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
              <div className="flex h-full flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-slate-950">{pickupLocation.name}</h2><StatusBadge tone={pickupLocation.isActive ? "green" : "slate"}>{pickupLocation.isActive ? "啟用中" : "已停用"}</StatusBadge></div>
                  <div className="mt-3 space-y-1 text-sm leading-6 text-slate-600"><p>地址：{pickupLocation.address}</p>{pickupLocation.description && <p>說明：{pickupLocation.description}</p>}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2"><Link href={`/admin/pickup-locations/${pickupLocation.id}/edit`} className={buttonStyles.secondary}>編輯</Link><PickupLocationStatusForm action={(pickupLocation.isActive ? deactivatePickupLocationAction : reactivatePickupLocationAction).bind(null, pickupLocation.id)} isActive={pickupLocation.isActive} /></div>
              </div>
            </li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
