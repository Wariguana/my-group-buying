import { requireAdmin } from "@/lib/auth/current-admin";
import { createGroupBuyDraftAction } from "../actions";
import { GroupBuyForm } from "../group-buy-form";
import { PageHeader } from "@/components/ui/primitives";

export default async function NewGroupBuyPage() {
  await requireAdmin();
  return <section><PageHeader eyebrow="New group buy" title="新增團購草稿" description="先設定基本資料與訂購期間；販售規格、價格與庫存會在商品規格與庫存設定。" /><GroupBuyForm action={createGroupBuyDraftAction} submitLabel="建立草稿" /></section>;
}
