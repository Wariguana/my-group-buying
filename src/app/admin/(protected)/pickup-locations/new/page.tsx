import { requireAdmin } from "@/lib/auth/current-admin";
import { createPickupLocationAction } from "../actions";
import { PickupLocationForm } from "../pickup-location-form";
import { PageHeader } from "@/components/ui/primitives";

export default async function NewPickupLocationPage() {
  await requireAdmin();

  return (
    <section>
      <PageHeader title="新增取貨地點" description="新增後取貨地點預設為啟用。" />
      <PickupLocationForm action={createPickupLocationAction} submitLabel="新增取貨地點" />
    </section>
  );
}
