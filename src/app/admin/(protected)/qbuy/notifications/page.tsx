import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { getDb } from "@/lib/db";
import { QbuyForm } from "@/components/qbuy/form";
import { PageHeader, buttonStyles } from "@/components/ui/primitives";
type Recipient = { id: string; customerAccountId: string | null; adminId: string | null; enabled: boolean };
function RecipientPanel({ recipients }: { recipients: Recipient[] }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold">進階設定：LINE 通知對象核實</summary>
      <p className="my-3 text-sm leading-6 text-slate-600">須核實 LINE 身分、接收同意與推播資格。登入成功不等於可以推播。</p>
      <QbuyForm operation="recipient" base={{}} confirm label="記錄已核實通知對象"
        fields={[
          { name: "customerAccountId", label: "顧客 UUID（與管理員擇一）", required: false },
          { name: "adminId", label: "管理員 UUID（與顧客擇一）", required: false },
          { name: "messagingUserId", label: "Messaging 使用者 ID" },
          { name: "providerId", label: "已核實 Provider ID" },
          { name: "evidence", label: "身分、同意與可推播資格核實依據" },
        ]} />
      {recipients.map((recipient) => (
        <div key={recipient.id} className="border-t border-slate-100 py-3 text-sm">
          <p className="break-all">對象 {recipient.customerAccountId ?? recipient.adminId} · {recipient.enabled ? "通知已啟用" : "通知已停用"}</p>
          {recipient.enabled && <QbuyForm operation="recipient-disable" base={{ id: recipient.id }} confirm label="停用此通知對象" fields={[{ name: "evidence", label: "停用或撤回同意依據" }]} />}
        </div>
      ))}
    </details>
  );
}


export default async function Page(){await requireAdmin(); const recipients=await getDb().lineRecipient.findMany({take:50,orderBy:{verifiedAt:"desc"}}); return <section className="space-y-5"><PageHeader title="已核實通知對象" description="進階設定：僅處理經核實的身分與接收同意，不會因登入自動開啟推播。"/><Link href="/admin/qbuy" className={buttonStyles.secondary}>返回訂單管理</Link><RecipientPanel recipients={recipients}/></section>;}