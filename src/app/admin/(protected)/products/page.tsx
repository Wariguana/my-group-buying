import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { listProducts } from "@/lib/products/service";
import { EmptyState, ErrorNotice, PageHeader, buttonStyles } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { deactivateProductAction, reactivateProductAction } from "./actions";
import { ProductStatusForm } from "./status-form";

const twdFormatter = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireAdmin();
  const [{ error }, result] = await Promise.all([searchParams, listProducts()]);
  const statusError = error === "not-found" ? "找不到商品。" : error === "failed" ? "狀態更新失敗，請稍後再試。" : null;

  return (
    <section>
      <PageHeader title="商品管理" description="維護商品售價、成本、單位與供應商資訊。" actions={<Link href="/admin/products/new" className={buttonStyles.primary}>新增商品</Link>} />
      <div className="mt-7 space-y-5">
        {statusError && <ErrorNotice>{statusError}</ErrorNotice>}
        {!result.ok ? <ErrorNotice>無法載入商品，請稍後再試。</ErrorNotice> : result.value.length === 0 ? (
          <EmptyState title="目前尚無商品資料。" description="建立商品後，即可加入團購草稿。" action={<Link href="/admin/products/new" className={buttonStyles.primary}>新增第一筆商品</Link>} />
        ) : (
          <ul className="grid gap-4 xl:grid-cols-2">
            {result.value.map((product) => <li key={product.id} className={`rounded-xl border p-5 shadow-sm ${product.isActive ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
              <div className="flex h-full flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-slate-950">{product.name}</h2><StatusBadge tone={product.isActive ? "green" : "slate"}>{product.isActive ? "啟用中" : "已停用"}</StatusBadge></div>
                  <div className="mt-3 grid gap-x-6 gap-y-1 text-sm leading-6 text-slate-600 sm:grid-cols-2"><p className="sm:col-span-2">供應商：{product.supplier?.name ?? "未指定"}{product.supplier && !product.supplier.isActive ? "（已停用）" : ""}</p><p>預設售價：<span className="font-semibold text-slate-800">{twdFormatter.format(product.defaultPrice)}</span></p><p>預設成本：<span className="font-semibold text-slate-800">{twdFormatter.format(product.cost)}</span></p><p>單位：{product.unit}</p></div>
                </div>
                <div className="flex shrink-0 items-center gap-2"><Link href={`/admin/products/${product.id}/edit`} className={buttonStyles.secondary}>編輯</Link><ProductStatusForm action={(product.isActive ? deactivateProductAction : reactivateProductAction).bind(null, product.id)} isActive={product.isActive} /></div>
              </div>
            </li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
