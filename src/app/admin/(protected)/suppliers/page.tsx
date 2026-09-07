import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { listSuppliers } from "@/lib/suppliers/service";
import { deactivateSupplierAction, reactivateSupplierAction } from "./actions";
import { SupplierStatusForm } from "./status-form";

export default async function SuppliersPage({ searchParams }: PageProps<"/admin/suppliers">) {
  await requireAdmin();
  const [{ error }, result] = await Promise.all([searchParams, listSuppliers()]);
  const statusError = error === "not-found"
    ? "找不到供應商。"
    : error === "failed"
      ? "狀態更新失敗，請稍後再試。"
      : null;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">供應商管理</h2>
        <Link href="/admin/suppliers/new" className="rounded-md bg-foreground px-4 py-2 font-medium text-background">新增供應商</Link>
      </div>
      {statusError && <p role="alert" className="mt-6 text-sm text-red-700 dark:text-red-400">{statusError}</p>}
      {!result.ok ? (
        <p role="alert" className="mt-8 rounded-md border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          無法載入供應商，請稍後再試。
        </p>
      ) : result.value.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-zinc-400 p-8 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">目前尚無供應商資料。</p>
          <Link href="/admin/suppliers/new" className="mt-4 inline-block font-medium underline underline-offset-4">新增第一筆供應商</Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {result.value.map((supplier) => (
            <li key={supplier.id} className={`rounded-md border p-5 ${supplier.isActive ? "border-zinc-300 dark:border-zinc-700" : "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-foreground">{supplier.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${supplier.isActive ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>
                      {supplier.isActive ? "啟用中" : "已停用"}
                    </span>
                  </div>
                  {supplier.contactName && <p>聯絡人：{supplier.contactName}</p>}
                  {supplier.phone && <p>電話：{supplier.phone}</p>}
                  {supplier.lineContact && <p>LINE / 聯絡方式：{supplier.lineContact}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/admin/suppliers/${supplier.id}/edit`} className="rounded-md border border-zinc-400 px-3 py-1.5 text-sm font-medium">編輯</Link>
                  <SupplierStatusForm
                    action={(supplier.isActive ? deactivateSupplierAction : reactivateSupplierAction).bind(null, supplier.id)}
                    isActive={supplier.isActive}
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
