import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import { getSupplierById } from "@/lib/suppliers/service";
import { updateSupplierAction } from "../../actions";
import { SupplierForm } from "../../supplier-form";

export default async function EditSupplierPage({ params }: PageProps<"/admin/suppliers/[id]/edit">) {
  await requireAdmin();
  const { id } = await params;
  const result = await getSupplierById(id);
  if (!result.ok && result.error === "NOT_FOUND") notFound();

  if (!result.ok) {
    return <p role="alert" className="text-red-700 dark:text-red-400">無法載入供應商，請稍後再試。</p>;
  }

  return (
    <section>
      <h2 className="text-2xl font-semibold">編輯供應商</h2>
      {!result.value.isActive && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">此供應商目前為停用狀態。</p>}
      <SupplierForm
        action={updateSupplierAction.bind(null, result.value.id)}
        submitLabel="儲存變更"
        values={result.value}
      />
    </section>
  );
}
