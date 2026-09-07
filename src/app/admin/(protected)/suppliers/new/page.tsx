import { SupplierForm } from "../supplier-form";
import { createSupplierAction } from "../actions";

export default function NewSupplierPage() {
  return (
    <section>
      <h2 className="text-2xl font-semibold">新增供應商</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">新增後供應商預設為啟用。</p>
      <SupplierForm action={createSupplierAction} submitLabel="新增供應商" />
    </section>
  );
}
