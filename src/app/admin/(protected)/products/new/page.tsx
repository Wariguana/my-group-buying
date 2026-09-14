import { requireAdmin } from "@/lib/auth/current-admin";
import { listProductSupplierOptions } from "@/lib/products/service";
import { createProductAction } from "../actions";
import { ProductForm } from "../product-form";
import { ErrorNotice, PageHeader } from "@/components/ui/primitives";

export default async function NewProductPage() {
  await requireAdmin();
  const suppliers = await listProductSupplierOptions();

  if (!suppliers.ok) {
    return <ErrorNotice>無法載入供應商選項，請稍後再試。</ErrorNotice>;
  }

  return (
    <section>
      <PageHeader title="新增商品" description="新增後商品預設為啟用。" />
      <ProductForm action={createProductAction} submitLabel="新增商品" supplierOptions={suppliers.value} />
    </section>
  );
}
