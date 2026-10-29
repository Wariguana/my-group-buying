import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { getDb } from "@/lib/db";
import { checkoutLabels } from "@/lib/checkout/queries";
import { reasons } from "@/lib/checkout/validation";
import { OperationForm } from "./form";
import { disclosureStyles, titleStyles, buttonStyles, fieldStyles, EmptyState } from "@/components/ui/primitives";
import { labels } from "@/lib/qbuy/domain";
import { formatTaipeiDisplayDateTime } from "@/lib/group-buys/time";
import { refundStatusLabel } from "@/lib/checkout/presentation";
import type { Prisma } from "@/generated/prisma/client";
export const dynamic = "force-dynamic";
export default async function PaymentsPage({ searchParams }: {
    searchParams: Promise<{
        view?: string;
        page?: string;
        q?: string;
        settings?: string;
    }>;
}) {
    const query = await searchParams;
    const history = query.view === "all";
    const pageNumber = Math.max(1, Math.min(10000, Math.floor(Number(query.page) || 1)));
    const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
    const pageUrl = (page: number, all = history) => `/admin/payments?view=${all ? "all" : "queue"}&q=${encodeURIComponent(q)}&page=${page}`;
    await requireAdmin();
    const db = getDb();
    const where: Prisma.CheckoutWhereInput = { AND: [
        history ? {} : { OR: [
            { refunds: { some: { status: "PENDING" } } },
            { status: { in: ["REPORTED", "ANOMALY", "RECEIVED", "REFUND_REQUIRED"] } },
            { status: "EXPIRED", payment: { confirmedAmount: { gt: 0 } } },
        ] },
        q ? { OR: [
            { customerName: { contains: q, mode: "insensitive" } },
            { customerPhone: { contains: q } },
            { orders: { some: { orderNumber: { contains: q, mode: "insensitive" } } } },
        ] } : {},
    ] };
    const [stores, bank, rates, checkouts, count] = await Promise.all([db.verifiedPickupStore.findMany({ orderBy: { code: "asc" } }), db.checkoutSettings.findUnique({ where: { id: "default" } }), db.shippingRate.findMany(), db.checkout.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }], where, take: 50, skip: (pageNumber - 1) * 50, include: { items: true, payment: { include: { bankReport: { select: { lastFive: true } }, receipts: true } }, orders: true, refunds: true, audits: { orderBy: { createdAt: "desc" }, take: 30 } } }), db.checkout.count({ where })]);
    const now = new Date().getTime();
    return <div className="space-y-6"><h1 className={titleStyles.page}>轉帳核帳與 Checkout</h1><p>核帳必須查閱銀行實際入帳資料。末五碼與截圖僅為回報證據；隔離測試只使用模擬入帳。</p>
 <details id="settings" open={query.settings === "1"} className="target:rounded-xl target:ring-2 target:ring-amber-800"><summary className={disclosureStyles}>銀行與配送設定</summary><OperationForm operation="bank" label="儲存銀行設定" fields={[
            { name: "bankName", label: "銀行名稱", value: bank?.bankName }, { name: "bankCode", label: "銀行代碼", value: bank?.bankCode }, { name: "bankAccount", label: "收款帳號", value: bank?.bankAccount }, { name: "accountName", label: "戶名", value: bank?.accountName }, { name: "enabled", label: "開放轉帳結帳", type: "checkbox", value: String(bank?.enabled ?? false) }
        ]}/>
 <OperationForm operation="rate" label="儲存配送能力與費率" fields={[{ name: "method", label: "配送方式", options: ["HOME_DELIVERY", "SEVEN_ELEVEN", "FAMILY_MART"] }, { name: "temperature", label: "溫層", options: ["AMBIENT", "CHILLED", "FROZEN"] }, { name: "enabled", label: "能力已確認並啟用", type: "checkbox" }, { name: "fee", label: "每組運費", type: "number" }, { name: "freeThreshold", label: "每組免運門檻（空白不免運）", type: "number", required: false }, { name: "maxWeightGrams", label: "每組重量上限 g", type: "number" }, { name: "maxLengthMm", label: "長上限 mm", type: "number" }, { name: "maxWidthMm", label: "寬上限 mm", type: "number" }, { name: "maxHeightMm", label: "高上限 mm", type: "number" }, { name: "capabilityEvidence", label: "物流能力查核依據" }]}/>
 <OperationForm operation="store" label="儲存已核實全家門市" fields={[{ name: "code", label: "全家門市代碼" }, { name: "name", label: "全家門市名稱" }, { name: "address", label: "全家門市地址" }, { name: "verificationEvidence", label: "門市資料核實依據" }, { name: "isActive", label: "已核實並啟用門市", type: "checkbox" }]}/><p>全家僅顯示經核實且啟用的門市；須同時設定全家配送能力。此為人工維護清單，並非物流商自動串接。</p><ul>{stores.map(s => <li key={s.id}>{s.code} · {s.name} · {s.address} · {s.isActive ? "啟用" : "停用"} · {s.verificationEvidence}</li>)}</ul>
 <ul>{rates.map(r => <li key={r.id}>{labels[r.method]}/{labels[r.temperature]} · {r.enabled ? "啟用" : "停用"} · 運費 {r.fee}／免運門檻 {r.freeThreshold ?? "無"} · {r.capabilityEvidence}</li>)}</ul></details>
 <OperationForm operation="expire" label="執行到期清理（可安全重試）" fields={[]}/>
 <nav className="flex flex-wrap gap-3"><Link className={buttonStyles.secondary} aria-current={!history ? "page" : undefined} href={pageUrl(1, false)}>待核帳／異常佇列</Link><Link className={buttonStyles.secondary} aria-current={history ? "page" : undefined} href={pageUrl(1, true)}>全部購買與歷史紀錄</Link></nav>
 <form className="flex gap-3"><input type="hidden" name="view" value={history ? "all" : "queue"}/><label className="min-w-0 flex-1">搜尋核帳紀錄<input name="q" maxLength={100} defaultValue={q} placeholder="QB 編號、姓名或電話" className={fieldStyles}/></label><button className={`${buttonStyles.primary} self-end`}>搜尋</button></form>
 <p>共 {count} 筆，第 {pageNumber} 頁。依最早建立時間排列，每頁 50 筆。入帳後請執行正式建單，失敗可重試。</p>
 {!checkouts.length && <EmptyState title="目前沒有符合條件的核帳紀錄" description="可調整搜尋條件，或切換至全部購買與歷史紀錄。"/>}
 {checkouts.map(c => <article key={c.id} className="space-y-4 rounded-xl border bg-white p-5"><h2 className={titleStyles.card}>{c.customerName} · {c.customerPhone}</h2><p>狀態 {checkoutLabels[c.status]} · 等待 {Math.floor((now - (c.payment?.reportedAt ?? c.createdAt).getTime()) / 3600000)} 小時</p>
 <p>應收 NT${c.totalAmount}／已確認入帳 NT${c.payment?.confirmedAmount ?? 0}／差額 NT${(c.payment?.confirmedAmount ?? 0) - c.totalAmount}</p><p>回報成功：{c.payment?.reportedAt?.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) ?? "尚未回報"}／末五碼 {c.payment?.bankReport?.lastFive ?? "—"}</p>
 <ul>{c.items.map(i => <li key={i.id}>{i.groupTitle} · {i.productName}／{i.specification} × {i.quantity} · NT${i.unitPrice * i.quantity}</li>)}</ul>
 {c.payment?.bankReport && <a className={buttonStyles.secondary} href={`/api/checkout/${c.id}/screenshot`} target="_blank" rel="noreferrer">查看私有轉帳截圖</a>}
 <p>{c.orders.map(o => o.orderNumber).join("／")}</p><p>{c.payment?.anomalyReason} {c.payment?.anomalyNote}</p>
 <details><summary className={disclosureStyles}>確認銀行入帳／補差額</summary><OperationForm operation="receipt" checkoutId={c.id} label="確認已收款" confirmMessage="已查閱銀行實際入帳資料，確認此筆銀行參考號、金額及入帳時間無誤？隔離測試僅填模擬入帳。" fields={[{ name: "requestId", label: "本次操作識別", type: "hidden", value: randomUUID() }, { name: "bankReference", label: "銀行交易參考號（不可重複）" }, { name: "amount", label: "本筆實際入帳金額", type: "number" }, { name: "bankReceivedAt", label: "銀行入帳時間", type: "datetime-local" }, { name: "note", label: "查核依據／模擬測試註記" }]}/></details>
 {c.status === "RECEIVED" && <OperationForm operation="finalize" checkoutId={c.id} label="建立全部 QB 訂單／重試建單" confirmMessage="確認依已核實入帳，原子建立本次全部正式訂單？" fields={[]}/>}
 <details><summary className={disclosureStyles}>異常及更正稽核</summary><OperationForm operation="anomaly" checkoutId={c.id} label="記錄異常（保留預留）" fields={[{ name: "reason", label: "異常原因", options: reasons }, { name: "note", label: "說明／客服更正紀錄（保留原回報）" }]}/></details>
 <details><summary className={disclosureStyles}>逾期補單或退款義務</summary><OperationForm operation="exception" checkoutId={c.id} label="確認例外處置" confirmMessage="確認依銀行入帳及客服紀錄處置？退款處置會釋放尚存的預留，只記錄退款義務，不會實際退款。" fields={[{ name: "action", label: "處置", options: ["REBOOK", "REFUND"] }, { name: "note", label: "處置依據與客服紀錄" }]}/></details>
 {c.refunds.map(r => <p key={r.id}>退款義務 NT${r.amount} · {r.reason} · {refundStatusLabel(r.status)}</p>)}
 <details><summary className={disclosureStyles}>入帳及操作稽核（臺灣時間）</summary>{c.payment?.receipts.map(r => <p key={r.id}>{r.bankReference} · NT${r.amount} · 銀行 {formatTaipeiDisplayDateTime(r.bankReceivedAt)}／登錄 {formatTaipeiDisplayDateTime(r.recordedAt)} · {r.note}</p>)}{c.audits.map(a => <p key={a.id}>{formatTaipeiDisplayDateTime(a.createdAt)} · {a.event} · {a.actorId ?? "顧客／系統"} · {JSON.stringify(a.detail)}</p>)}</details>
 </article>)}<nav aria-label="核帳分頁" className="flex gap-3">{pageNumber > 1 && <Link className={buttonStyles.secondary} href={pageUrl(pageNumber - 1)}>上一頁</Link>}{pageNumber * 50 < count && <Link className={buttonStyles.secondary} href={pageUrl(pageNumber + 1)}>下一頁</Link>}</nav><Link href="/admin" className={buttonStyles.secondary}>管理首頁</Link></div>;
}
