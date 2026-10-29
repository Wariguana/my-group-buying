import Link from "next/link";
import { featureEnabled } from "@/lib/operations/config";
import { notFound, redirect } from "next/navigation";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";
import { CustomerPageShell } from "@/app/group-buys/public-ui";
import { readCheckout } from "@/lib/checkout/service";
import { TransferForm } from "./transfer-form";
import { z } from "zod";
import { checkoutLabels, checkoutNextStep, refundStatusLabel } from "@/lib/checkout/presentation";
import { labels as deliveryLabels } from "@/lib/qbuy/domain";
import { buttonStyles, titleStyles, disclosureStyles } from "@/components/ui/primitives";
import { CustomerSupport } from "@/components/qbuy/support";
import { specificationLabel } from "@/lib/commerce/presentation";
export const dynamic = "force-dynamic";
export default async function CheckoutDetail({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const account = await getCurrentCustomerAccount();
    if (!account)
        redirect("/");
    const parsed = z.uuid().safeParse((await params).id);
    if (!parsed.success)
        notFound();
    const c = await readCheckout(parsed.data, account.id);
    if (!c)
        notFound();
    const bank = c.bankSnapshot as Record<string, string>;
    const delivery = c.delivery as Record<string, string>;
    return <CustomerPageShell customerAccount={account}><div className="space-y-5"><Link href="/my/orders" className={buttonStyles.secondary}>我的訂單</Link><h1 className={titleStyles.page}>本次購買</h1>
 <p className="text-xl font-bold" role="status">{checkoutLabels[c.status]}</p><p className="rounded-xl bg-amber-50 p-4">{checkoutNextStep(c.status)}</p><p>應付 NT${c.totalAmount}（商品 {c.subtotal}＋運費 {c.shippingAmount}）</p>
 <p>收件人：{c.customerName}／{c.customerPhone}</p><p>配送：{delivery.method === "HOME_DELIVERY" ? "宅配" : delivery.method === "FAMILY_MART" ? "全家" : "7-ELEVEN"} · {delivery.storeName} · {delivery.address}</p>
 {c.fulfillmentGroups.map((g, index) => <section key={g.id} className="rounded-xl border bg-white p-4"><h2 className={titleStyles.card}>出貨群組 {index + 1} · {deliveryLabels[g.method]} · {deliveryLabels[g.temperature]}</h2><p>本組運費 NT${g.shippingAmount}；等待全部開團截止：{g.waitUntil.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p><ul>{c.items.filter(i => i.fulfillmentGroupId === g.id).map(i => <li key={i.id}>{i.groupTitle} · {i.productName} · {specificationLabel(i.specification)} × {i.quantity} · NT${i.unitPrice * i.quantity}</li>)}</ul></section>)}
 {c.orders.map(o => <details key={o.id} className="rounded border p-4"><summary className={disclosureStyles}>{o.orderNumber} · 已付款 NT${o.paidAmount}</summary><p>運費分攤 NT${o.shippingAmount}</p>{c.items.filter(i => i.groupBuyId === o.groupBuyId).map(i => <p key={i.id}>{i.groupTitle}／{i.productName} × {i.quantity}</p>)}</details>)}
 {c.status === "AWAITING_PAYMENT" && <section className="space-y-4 rounded-xl border bg-white p-4"><h2 className={titleStyles.card}>銀行轉帳／ATM</h2>{c.expiresAt <= new Date() ? <p>付款回報期限已過，請勿新增匯款；若已付款請聯絡客服。</p> : featureEnabled("BANK_DETAILS") ? <p className="break-all">{bank.bankName}（{bank.bankCode}）· {bank.bankAccount} · {bank.accountName}</p> : <p>目前暫停顯示收款資訊，請勿新增匯款；若已匯款，仍可提交付款回報並聯絡客服。</p>}<p>付款及回報期限（臺灣時間）：{c.expiresAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p><TransferForm checkoutId={c.id} expiresAt={c.expiresAt.toISOString()}/></section>}
 {c.payment?.reportedAt && <p>回報成功時間：{c.payment.reportedAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}。{["REPORTED", "ANOMALY"].includes(c.status) && "已停止付款倒數；庫存保留待核帳。"}</p>}
 {c.status === "ANOMALY" && <p>付款異常：{c.payment?.anomalyReason}。請聯絡 LINE 官方客服；補差額需經人工確認總入帳。</p>}
 {c.refunds.map(r => <p key={r.id}>退款 NT${r.amount} · {refundStatusLabel(r.status)}{r.processedAt && ` · ${r.processedAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`}</p>)}
 <Link href={`/my/orders/${c.id}`} className={buttonStyles.primary}>取消申請、退款與配送進度</Link>
 <p>本系統採人工核帳，未自動核實銀行入帳。</p><CustomerSupport/></div></CustomerPageShell>;
}
