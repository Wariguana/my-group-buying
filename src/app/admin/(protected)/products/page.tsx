import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { listProducts } from "@/lib/products/service";
import { deactivateProductAction, reactivateProductAction } from "./actions";
import { ProductStatusForm } from "./status-form";

const twdFormatter = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireAdmin();
  const [{ error }, result] = await Promise.all([searchParams, listProducts()]);
  const statusError = error === "not-found"
    ? "找不到商品。"
    : error === "failed"
      ? "狀態更新失敗，請稍後再試。"
      : null;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">商品管理</h2>
        <Link href="/admin/products/new" className="rounded-md bg-foreground px-4 py-2 font-medium text-background">新增商品</Link>
      </div>
      {statusError && <p role="alert" className="mt-6 text-sm text-red-700 dark:text-red-400">{statusError}</p>}
      {!result.ok ? (
        <p role="alert" className="mt-8 rounded-md border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          無法載入商品，請稍後再試。
        </p>
      ) : result.value.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-zinc-400 p-8 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">目前尚無商品資料。</p>
          <Link href="/admin/products/new" className="mt-4 inline-block font-medium underline underline-offset-4">新增第一筆商品</Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {result.value.map((product) => (
            <li key={product.id} className={`rounded-md border p-5 ${product.isActive ? "border-zinc-300 dark:border-zinc-700" : "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-foreground">{product.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${product.isActive ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>
                      {product.isActive ? "啟用中" : "已停用"}
                    </span>
                  </div>
                  <p>
                    供應商：{product.supplier?.name ?? "未指定"}
                    {product.supplier && !product.supplier.isActive ? "（已停用）" : ""}
                  </p>
                  <p>預設售價：{twdFormatter.format(product.defaultPrice)}</p>
                  <p>預設成本：{twdFormatter.format(product.cost)}</p>
                  <p>單位：{product.unit}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/admin/products/${product.id}/edit`} className="rounded-md border border-zinc-400 px-3 py-1.5 text-sm font-medium">編輯</Link>
                  <ProductStatusForm
                    action={(product.isActive ? deactivateProductAction : reactivateProductAction).bind(null, product.id)}
                    isActive={product.isActive}
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
