import { requireAdmin } from "@/lib/auth/current-admin";
import { listGroupBuyPickupLocationOptions, listGroupBuyProductOptions } from "@/lib/group-buys/service";
import { createGroupBuyDraftAction } from "../actions";
import { GroupBuyForm } from "../group-buy-form";

export default async function NewGroupBuyPage() {
  await requireAdmin();
  const [products, pickups] = await Promise.all([listGroupBuyProductOptions(), listGroupBuyPickupLocationOptions()]);
  if (!products.ok || !pickups.ok) return <p role="alert" className="text-red-700 dark:text-red-400">無法載入團購選項，請稍後再試。</p>;
  return <section><h2 className="text-2xl font-semibold">新增團購草稿</h2><p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">草稿可暫時不選商品或取貨地點。</p><GroupBuyForm action={createGroupBuyDraftAction} submitLabel="建立草稿" productOptions={products.value} pickupOptions={pickups.value} /></section>;
}
