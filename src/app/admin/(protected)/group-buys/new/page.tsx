import { requireAdmin } from "@/lib/auth/current-admin";
import { listGroupBuyPickupLocationOptions, listGroupBuyProductOptions } from "@/lib/group-buys/service";
import { createGroupBuyDraftAction } from "../actions";
import { GroupBuyForm } from "../group-buy-form";
import { ErrorNotice, PageHeader } from "@/components/ui/primitives";

export default async function NewGroupBuyPage() {
  await requireAdmin();
  const [products, pickups] = await Promise.all([listGroupBuyProductOptions(), listGroupBuyPickupLocationOptions()]);
  if (!products.ok || !pickups.ok) return <ErrorNotice>無法載入團購選項，請稍後再試。</ErrorNotice>;
  return <section><PageHeader eyebrow="New group buy" title="新增團購草稿" description="先設定基本資料與訂購期間；商品和取貨地點可稍後補齊。" /><GroupBuyForm action={createGroupBuyDraftAction} submitLabel="建立草稿" productOptions={products.value} pickupOptions={pickups.value} /></section>;
}
