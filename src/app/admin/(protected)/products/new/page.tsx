import { requireAdmin } from "@/lib/auth/current-admin";
import { listProductSupplierOptions } from "@/lib/products/service";
import { createProductAction } from "../actions";
import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  await requireAdmin();
  const suppliers = await listProductSupplierOptions();

  if (!suppliers.ok) {
    return <p role="alert" className="text-red-700 dark:text-red-400">無法載入供應商選項，請稍後再試。</p>;
  }

  return (
    <section>
      <h2 className="text-2xl font-semibold">新增商品</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">新增後商品預設為啟用。</p>
      <ProductForm action={createProductAction} submitLabel="新增商品" supplierOptions={suppliers.value} />
    </section>
  );
}
