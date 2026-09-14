import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import { getGroupBuyDraftById, listGroupBuyPickupLocationOptions, listGroupBuyProductOptions } from "@/lib/group-buys/service";
import { formatTaipeiDateTimeLocal } from "@/lib/group-buys/time";
import { publishGroupBuyAction, updateGroupBuyDraftAction } from "../../actions";
import { GroupBuyForm } from "../../group-buy-form";
import { PublishGroupBuyForm } from "../../publish-group-buy-form";
import { ErrorNotice, PageHeader } from "@/components/ui/primitives";

export default async function EditGroupBuyPage({ params }: PageProps<"/admin/group-buys/[id]/edit">) {
  await requireAdmin();
  const { id } = await params;
  const result = await getGroupBuyDraftById(id);
  if (!result.ok && result.error === "NOT_FOUND") notFound();
  if (!result.ok) return <ErrorNotice>無法載入團購，請稍後再試。</ErrorNotice>;
  if (result.value.status !== "DRAFT") return <section><PageHeader title="團購資料" /><div className="mt-6"><ErrorNotice>此團購目前不可用草稿模式編輯。</ErrorNotice></div></section>;

  const [products, pickups] = await Promise.all([
    listGroupBuyProductOptions(result.value.items.map((item) => item.productId)),
    listGroupBuyPickupLocationOptions(result.value.pickups.map((pickup) => pickup.pickupLocationId)),
  ]);
  if (!products.ok || !pickups.ok) return <ErrorNotice>無法載入團購選項，請稍後再試。</ErrorNotice>;
  return <section><PageHeader eyebrow="Draft" title="編輯團購草稿" description={result.value.title} /><GroupBuyForm action={updateGroupBuyDraftAction.bind(null, result.value.id)} submitLabel="儲存草稿" productOptions={products.value} pickupOptions={pickups.value} values={{ title: result.value.title, description: result.value.description, coverImageUrl: result.value.coverImageUrl, startAt: formatTaipeiDateTimeLocal(result.value.startAt), endAt: formatTaipeiDateTimeLocal(result.value.endAt), items: result.value.items.map((item) => ({ productId: item.productId, salePrice: String(item.salePrice), stock: item.stock == null ? "" : String(item.stock), purchaseLimit: item.purchaseLimit == null ? "" : String(item.purchaseLimit) })), pickups: result.value.pickups.map((pickup) => ({ pickupLocationId: pickup.pickupLocationId, pickupStartAt: pickup.pickupStartAt ? formatTaipeiDateTimeLocal(pickup.pickupStartAt) : "", pickupEndAt: pickup.pickupEndAt ? formatTaipeiDateTimeLocal(pickup.pickupEndAt) : "" })) }} /><PublishGroupBuyForm action={publishGroupBuyAction.bind(null, result.value.id)} /></section>;
}
