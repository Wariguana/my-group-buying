import { requireAdmin } from "@/lib/auth/current-admin";
import { createPickupLocationAction } from "../actions";
import { PickupLocationForm } from "../pickup-location-form";

export default async function NewPickupLocationPage() {
  await requireAdmin();

  return (
    <section>
      <h2 className="text-2xl font-semibold">新增取貨地點</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">新增後取貨地點預設為啟用。</p>
      <PickupLocationForm action={createPickupLocationAction} submitLabel="新增取貨地點" />
    </section>
  );
}
