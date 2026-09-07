import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import { getProductById, listProductSupplierOptions } from "@/lib/products/service";
import { updateProductAction } from "../../actions";
import { ProductForm } from "../../product-form";

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]/edit">) {
  await requireAdmin();
  const { id } = await params;
  const product = await getProductById(id);
  if (!product.ok && product.error === "NOT_FOUND") notFound();

  if (!product.ok) {
    return <p role="alert" className="text-red-700 dark:text-red-400">無法載入商品，請稍後再試。</p>;
  }

  const suppliers = await listProductSupplierOptions(product.value.supplierId);
  if (!suppliers.ok) {
    return <p role="alert" className="text-red-700 dark:text-red-400">無法載入供應商選項，請稍後再試。</p>;
  }

  return (
    <section>
      <h2 className="text-2xl font-semibold">編輯商品</h2>
      {!product.value.isActive && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">此商品目前為停用狀態。</p>}
      <ProductForm
        action={updateProductAction.bind(null, product.value.id)}
        submitLabel="儲存變更"
        supplierOptions={suppliers.value}
        values={product.value}
      />
    </section>
  );
}
