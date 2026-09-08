import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { listPickupLocations } from "@/lib/pickup-locations/service";
import {
  deactivatePickupLocationAction,
  reactivatePickupLocationAction,
} from "./actions";
import { PickupLocationStatusForm } from "./status-form";

export default async function PickupLocationsPage({ searchParams }: PageProps<"/admin/pickup-locations">) {
  await requireAdmin();
  const [{ error }, result] = await Promise.all([searchParams, listPickupLocations()]);
  const statusError = error === "not-found"
    ? "找不到取貨地點。"
    : error === "failed"
      ? "狀態更新失敗，請稍後再試。"
      : null;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">取貨地點管理</h2>
        <Link href="/admin/pickup-locations/new" className="rounded-md bg-foreground px-4 py-2 font-medium text-background">新增取貨地點</Link>
      </div>
      {statusError && <p role="alert" className="mt-6 text-sm text-red-700 dark:text-red-400">{statusError}</p>}
      {!result.ok ? (
        <p role="alert" className="mt-8 rounded-md border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          無法載入取貨地點，請稍後再試。
        </p>
      ) : result.value.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-zinc-400 p-8 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">目前尚無取貨地點資料。</p>
          <Link href="/admin/pickup-locations/new" className="mt-4 inline-block font-medium underline underline-offset-4">新增第一筆取貨地點</Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {result.value.map((pickupLocation) => (
            <li key={pickupLocation.id} className={`rounded-md border p-5 ${pickupLocation.isActive ? "border-zinc-300 dark:border-zinc-700" : "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-foreground">{pickupLocation.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pickupLocation.isActive ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>
                      {pickupLocation.isActive ? "啟用中" : "已停用"}
                    </span>
                  </div>
                  <p>地址：{pickupLocation.address}</p>
                  {pickupLocation.description && <p>說明：{pickupLocation.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/admin/pickup-locations/${pickupLocation.id}/edit`} className="rounded-md border border-zinc-400 px-3 py-1.5 text-sm font-medium">編輯</Link>
                  <PickupLocationStatusForm
                    action={(pickupLocation.isActive ? deactivatePickupLocationAction : reactivatePickupLocationAction).bind(null, pickupLocation.id)}
                    isActive={pickupLocation.isActive}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
