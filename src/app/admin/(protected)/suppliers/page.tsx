import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { listSuppliers } from "@/lib/suppliers/service";
import { EmptyState, ErrorNotice, PageHeader, buttonStyles } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { deactivateSupplierAction, reactivateSupplierAction } from "./actions";
import { SupplierStatusForm } from "./status-form";

export default async function SuppliersPage({ searchParams }: PageProps<"/admin/suppliers">) {
  await requireAdmin();
  const [{ error }, result] = await Promise.all([searchParams, listSuppliers()]);
  const statusError = error === "not-found" ? "找不到供應商。" : error === "failed" ? "狀態更新失敗，請稍後再試。" : null;

  return (
    <section>
      <PageHeader title="供應商管理" description="維護供應商聯絡資訊與啟用狀態。" actions={<Link href="/admin/suppliers/new" className={buttonStyles.primary}>新增供應商</Link>} />
      <div className="mt-7 space-y-5">
        {statusError && <ErrorNotice>{statusError}</ErrorNotice>}
        {!result.ok ? <ErrorNotice>無法載入供應商，請稍後再試。</ErrorNotice> : result.value.length === 0 ? (
          <EmptyState title="目前尚無供應商資料。" description="建立供應商後，即可在商品資料中選用。" action={<Link href="/admin/suppliers/new" className={buttonStyles.primary}>新增第一筆供應商</Link>} />
        ) : (
          <ul className="grid gap-4 xl:grid-cols-2">
            {result.value.map((supplier) => <li key={supplier.id} className={`rounded-xl border p-5 shadow-sm ${supplier.isActive ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
              <div className="flex h-full flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-slate-950">{supplier.name}</h2><StatusBadge tone={supplier.isActive ? "green" : "slate"}>{supplier.isActive ? "啟用中" : "已停用"}</StatusBadge></div>
                  <div className="mt-3 space-y-1 text-sm leading-6 text-slate-600">{supplier.contactName && <p>聯絡人：{supplier.contactName}</p>}{supplier.phone && <p>電話：{supplier.phone}</p>}{supplier.lineContact && <p>LINE / 聯絡方式：{supplier.lineContact}</p>}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2"><Link href={`/admin/suppliers/${supplier.id}/edit`} className={buttonStyles.secondary}>編輯</Link><SupplierStatusForm action={(supplier.isActive ? deactivateSupplierAction : reactivateSupplierAction).bind(null, supplier.id)} isActive={supplier.isActive} /></div>
              </div>
            </li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
