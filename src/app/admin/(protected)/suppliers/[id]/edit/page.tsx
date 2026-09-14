import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import { getSupplierById } from "@/lib/suppliers/service";
import { updateSupplierAction } from "../../actions";
import { SupplierForm } from "../../supplier-form";
import { ErrorNotice, PageHeader } from "@/components/ui/primitives";

export default async function EditSupplierPage({ params }: PageProps<"/admin/suppliers/[id]/edit">) {
  await requireAdmin();
  const { id } = await params;
  const result = await getSupplierById(id);
  if (!result.ok && result.error === "NOT_FOUND") notFound();

  if (!result.ok) {
    return <ErrorNotice>無法載入供應商，請稍後再試。</ErrorNotice>;
  }

  return (
    <section>
      <PageHeader title="編輯供應商" description={!result.value.isActive ? "此供應商目前為停用狀態。" : result.value.name} />
      <SupplierForm
        action={updateSupplierAction.bind(null, result.value.id)}
        submitLabel="儲存變更"
        values={result.value}
      />
    </section>
  );
}
