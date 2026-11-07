import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import { getGroupBuyDraftById } from "@/lib/group-buys/service";
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

  const isPublished = result.value.status === "PUBLISHED";
  const hasOrders = result.value._count.orders > 0 || result.value._count.qbOrders > 0;
  return <section><PageHeader eyebrow={isPublished ? "已發布" : "草稿"} title={isPublished ? "編輯已發布團購" : "編輯團購草稿"} description={result.value.title} />{hasOrders && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">此團購已有訂單。圖片調整只影響頁面呈現；既有訂單的歷史價格、商品與取貨資料不會被改寫。</div>}<GroupBuyForm action={updateGroupBuyDraftAction.bind(null, result.value.id)} submitLabel={isPublished ? "儲存修改" : "儲存草稿"} skuOfferCount={result.value._count.skuOffers} values={{ title: result.value.title, description: result.value.description, gallery: result.value.images.map((image) => ({ kind: "existing" as const, id: image.id, imageUrl: image.imageUrl })), startAt: formatTaipeiDateTimeLocal(result.value.startAt), endAt: formatTaipeiDateTimeLocal(result.value.endAt), allowsSevenEleven: result.value.allowsSevenEleven }} />{!isPublished && <PublishGroupBuyForm action={publishGroupBuyAction.bind(null, result.value.id)} />}</section>;
}
