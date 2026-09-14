import { SupplierForm } from "../supplier-form";
import { createSupplierAction } from "../actions";
import { PageHeader } from "@/components/ui/primitives";

export default function NewSupplierPage() {
  return (
    <section>
      <PageHeader title="新增供應商" description="新增後供應商預設為啟用。" />
      <SupplierForm action={createSupplierAction} submitLabel="新增供應商" />
    </section>
  );
}
