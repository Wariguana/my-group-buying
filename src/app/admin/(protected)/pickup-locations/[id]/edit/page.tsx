import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import { getPickupLocationById } from "@/lib/pickup-locations/service";
import { updatePickupLocationAction } from "../../actions";
import { PickupLocationForm } from "../../pickup-location-form";
import { ErrorNotice, PageHeader } from "@/components/ui/primitives";

export default async function EditPickupLocationPage({ params }: PageProps<"/admin/pickup-locations/[id]/edit">) {
  await requireAdmin();
  const { id } = await params;
  const result = await getPickupLocationById(id);
  if (!result.ok && result.error === "NOT_FOUND") notFound();

  if (!result.ok) {
    return <ErrorNotice>無法載入取貨地點，請稍後再試。</ErrorNotice>;
  }

  return (
    <section>
      <PageHeader title="編輯取貨地點" description={!result.value.isActive ? "此取貨地點目前為停用狀態。" : result.value.name} />
      <PickupLocationForm
        action={updatePickupLocationAction.bind(null, result.value.id)}
        submitLabel="儲存變更"
        values={result.value}
      />
    </section>
  );
}
