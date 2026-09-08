import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import { getPickupLocationById } from "@/lib/pickup-locations/service";
import { updatePickupLocationAction } from "../../actions";
import { PickupLocationForm } from "../../pickup-location-form";

export default async function EditPickupLocationPage({ params }: PageProps<"/admin/pickup-locations/[id]/edit">) {
  await requireAdmin();
  const { id } = await params;
  const result = await getPickupLocationById(id);
  if (!result.ok && result.error === "NOT_FOUND") notFound();

  if (!result.ok) {
    return <p role="alert" className="text-red-700 dark:text-red-400">無法載入取貨地點，請稍後再試。</p>;
  }

  return (
    <section>
      <h2 className="text-2xl font-semibold">編輯取貨地點</h2>
      {!result.value.isActive && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">此取貨地點目前為停用狀態。</p>}
      <PickupLocationForm
        action={updatePickupLocationAction.bind(null, result.value.id)}
        submitLabel="儲存變更"
        values={result.value}
      />
    </section>
  );
}
