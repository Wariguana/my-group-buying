import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import { getProductById, listProductSupplierOptions } from "@/lib/products/service";
import { updateProductAction } from "../../actions";
import { ProductForm } from "../../product-form";
import { ErrorNotice, PageHeader } from "@/components/ui/primitives";

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]/edit">) {
  await requireAdmin();
  const { id } = await params;
  const product = await getProductById(id);
  if (!product.ok && product.error === "NOT_FOUND") notFound();

  if (!product.ok) {
    return <ErrorNotice>無法載入商品，請稍後再試。</ErrorNotice>;
  }

  const suppliers = await listProductSupplierOptions(product.value.supplierId);
  if (!suppliers.ok) {
    return <ErrorNotice>無法載入供應商選項，請稍後再試。</ErrorNotice>;
  }

  return (
    <section>
      <PageHeader title="編輯商品" description={!product.value.isActive ? "此商品目前為停用狀態。" : product.value.name} />
      <ProductForm
        action={updateProductAction.bind(null, product.value.id)}
        submitLabel="儲存變更"
        supplierOptions={suppliers.value}
        values={product.value}
      />
    </section>
  );
}
