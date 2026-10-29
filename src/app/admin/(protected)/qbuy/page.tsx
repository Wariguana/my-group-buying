import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/current-admin";
import { adminLifecycle,queues } from "@/lib/qbuy/queries";
import { LifecyclePanel } from "@/components/qbuy/lifecycle";
import { QbuyForm } from "@/components/qbuy/form";
import { titleStyles, buttonStyles, disclosureStyles, EmptyState, fieldStyles } from "@/components/ui/primitives";
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{q?:string;page?:string;queue?:string}>}) {
 await requireAdmin();const recipients=await getDb().lineRecipient.findMany({take:50,orderBy:{verifiedAt:"desc"}});const result=await adminLifecycle(await searchParams);
 const url=(page:number)=>`/admin/qbuy?queue=${encodeURIComponent(result.queue)}&q=${encodeURIComponent(result.q)}&page=${page}`;
 return <div className="space-y-5"><h1 className={titleStyles.page}>QB 取消、退款與履約工作台</h1><p>物流採人工核實。銀行退款需實際成功及二次確認；建立退款義務不代表已退款。</p><nav className="flex flex-wrap gap-3">{Object.entries(queues).map(([key,value])=><Link className={buttonStyles.secondary} aria-current={result.queue===key?"page":undefined} key={key} href={`/admin/qbuy?queue=${key}`}>{value}</Link>)}</nav>
 <form className="flex gap-3" aria-label="搜尋履約案件"><input type="hidden" name="queue" value={result.queue}/><label className="min-w-0 flex-1">搜尋 QB 編號、姓名或電話<input className={fieldStyles} name="q" defaultValue={result.q} placeholder="QB 編號、姓名或電話"/></label><button className={`${buttonStyles.primary} self-end`}>搜尋</button></form><p>共 {result.count} 筆，本頁 {result.page}，每頁 20 筆。</p>
 {!result.rows.length&&<EmptyState title="目前沒有符合條件的案件" description="可調整搜尋條件，或切換其他工作佇列。"/>}
 {result.rows.map(c=><article key={c.id} className="space-y-4 rounded-xl border bg-white p-5"><h2 className={titleStyles.card}>{c.customerName} · {c.customerPhone}</h2><Link className={buttonStyles.secondary} href="/admin/payments?view=all">核帳與私有轉帳截圖</Link><LifecyclePanel c={c} admin/>
 <details><summary className={disclosureStyles}>通知狀態與重試</summary>{c.outbox.map(e=><div key={e.id}><p>{e.event} · {e.status} · 嘗試 {e.attempts} 次 · 建立 {e.createdAt.toISOString()} · 下次 {e.nextAttemptAt.toISOString()} · {e.lastError}</p>{["BLOCKED","RETRY"].includes(e.status)&&<QbuyForm operation="retry" base={{id:e.id}} fields={[]} confirm label="排入安全重試"/>}</div>)}</details>
 <details><summary className={disclosureStyles}>操作稽核（最近 50 筆）</summary>{c.audits.map(a=><p key={a.id} className="break-all">{a.createdAt.toISOString()} · {a.event} · 操作者 {a.actorId??"顧客／系統"} · {JSON.stringify(a.detail)}</p>)}</details></article>)}
 <nav aria-label="履約工作台分頁" className="flex gap-4">{result.page>1&&<Link className={buttonStyles.secondary} href={url(result.page-1)}>上一頁</Link>}{result.page*20<result.count&&<Link className={buttonStyles.secondary} href={url(result.page+1)}>下一頁</Link>}</nav>
 <details><summary className={disclosureStyles}>LINE 通知對象人工驗證</summary><p>須先驗證同一 provider 下的 LINE 身分、官方帳號可推播資格及接收同意；登入成功本身不代表可推播。驗證資料建立後不可覆寫接收者。</p><QbuyForm operation="recipient" base={{}} confirm label="記錄已核實通知對象" fields={[{name:"customerAccountId",label:"顧客 UUID（與 Admin 擇一）",required:false},{name:"adminId",label:"Admin UUID（與顧客擇一）",required:false},{name:"messagingUserId",label:"Messaging 使用者 ID"},{name:"providerId",label:"已核實 provider ID"},{name:"evidence",label:"身分、同意與可推播資格核實依據"}]}/>{recipients.map(r=><div key={r.id}><p>對象 {r.customerAccountId??r.adminId} · {r.enabled?"通知已啟用":"通知已停用"} · 核實操作者 {r.verifiedById}</p>{r.enabled&&<QbuyForm operation="recipient-disable" base={{id:r.id}} confirm label="停用此通知對象" fields={[{name:"evidence",label:"停用／撤回同意依據"}]}/>}</div>)}</details></div>;
}
