import { buttonStyles, ErrorNotice, PageHeader } from "@/components/ui/primitives";
import Link from "next/link";
import { OperationsHealth } from "@/components/admin/operations-health";
import { requireAdmin } from "@/lib/auth/current-admin";
import { operationalHealth } from "@/lib/operations/health";
export const dynamic = "force-dynamic";
export default async function OperationsPage() {
  await requireAdmin();
  const health = await operationalHealth().catch(() => null);
  return <div className="space-y-6">
    <PageHeader title="平台與營運監控" description="先檢查系統健康與待辦，需要時再展開完整診斷。" />
    {health ? <OperationsHealth health={health} /> : <ErrorNotice>監控資料讀取失敗，系統狀態未知。請重新載入後再確認。<Link className={`ml-2 ${buttonStyles.secondary}`} href="/admin/operations">重新載入監控</Link></ErrorNotice>}
  </div>;
}
