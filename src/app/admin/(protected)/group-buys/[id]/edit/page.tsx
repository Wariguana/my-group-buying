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
  if (result.value.status === "CANCELLED") return <section><PageHeader title="團購資料" /><div className="mt-6"><ErrorNotice>已取消的團購不可編輯。</ErrorNotice></div></section>;

  const [products, pickups] = await Promise.all([
    listGroupBuyProductOptions(result.value.items.map((item) => item.productId)),
    listGroupBuyPickupLocationOptions(result.value.pickups.map((pickup) => pickup.pickupLocationId)),
  ]);
  if (!products.ok || !pickups.ok) return <ErrorNotice>無法載入團購選項，請稍後再試。</ErrorNotice>;
  const isPublished = result.value.status === "PUBLISHED";
  const hasOrders = result.value._count.orders > 0;
  return <section><PageHeader eyebrow={isPublished ? "已發布" : "草稿"} title={isPublished ? "編輯已發布團購" : "編輯團購草稿"} description={result.value.title} />{hasOrders && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">此團購已有訂單。部分修改只影響後續新訂單，既有訂單的歷史價格與取貨資料不會被改寫。</div>}<GroupBuyForm action={updateGroupBuyDraftAction.bind(null, result.value.id)} submitLabel={isPublished ? "儲存修改" : "儲存草稿"} productOptions={products.value} pickupOptions={pickups.value} stockLocked={hasOrders} values={{ title: result.value.title, description: result.value.description, coverImageUrl: result.value.coverImageUrl, startAt: formatTaipeiDateTimeLocal(result.value.startAt), endAt: formatTaipeiDateTimeLocal(result.value.endAt), items: result.value.items.map((item) => ({ productId: item.productId, salePrice: String(item.salePrice), stock: item.stock == null ? "" : String(item.stock), purchaseLimit: item.purchaseLimit == null ? "" : String(item.purchaseLimit) })), pickups: result.value.pickups.map((pickup) => ({ pickupLocationId: pickup.pickupLocationId, pickupStartAt: pickup.pickupStartAt ? formatTaipeiDateTimeLocal(pickup.pickupStartAt) : "", pickupEndAt: pickup.pickupEndAt ? formatTaipeiDateTimeLocal(pickup.pickupEndAt) : "" })) }} />{!isPublished && <PublishGroupBuyForm action={publishGroupBuyAction.bind(null, result.value.id)} />}</section>;
}
