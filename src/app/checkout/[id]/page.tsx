import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";
import { CustomerPageShell } from "@/app/group-buys/public-ui";
import { readCheckout } from "@/lib/checkout/service";
import { TransferForm } from "./transfer-form";
import { z } from "zod";
export const dynamic = "force-dynamic";
const labels: Record<string, string> = { AWAITING_PAYMENT: "待付款", REPORTED: "待 QBUY 確認", ANOMALY: "付款異常", EXPIRED: "已逾期", RECEIVED: "已確認入帳，待建立正式訂單", FINALIZED: "已成立正式訂單", REFUND_REQUIRED: "待處理退款義務" };
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
    return <CustomerPageShell customerAccount={account}><div className="space-y-5"><Link href="/my/orders" className="underline">我的訂單</Link><h1 className="text-3xl font-bold">本次購買</h1>
 <p className="text-xl" role="status">{labels[c.status]}</p><p>應付 NT${c.totalAmount}（商品 {c.subtotal}＋運費 {c.shippingAmount}）</p>
 <p>收件人：{c.customerName}／{c.customerPhone}</p><p>配送：{delivery.method === "HOME_DELIVERY" ? "宅配" : "7-ELEVEN"} · {delivery.storeName} · {delivery.address}</p>
 {c.fulfillmentGroups.map(g => <section key={g.id} className="rounded border p-4"><h2 className="font-bold">出貨群組 · {g.method} · {g.temperature}</h2><p>本組運費 NT${g.shippingAmount}；等待全部開團截止：{g.waitUntil.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p><ul>{c.items.filter(i => i.fulfillmentGroupId === g.id).map(i => <li key={i.id}>{i.groupTitle} · {i.productName} · {i.specification} × {i.quantity} · NT${i.unitPrice * i.quantity}</li>)}</ul></section>)}
 {c.orders.map(o => <details key={o.id} className="rounded border p-4"><summary>{o.orderNumber} · 已付款 NT${o.paidAmount}</summary><p>運費分攤 NT${o.shippingAmount}</p>{c.items.filter(i => i.groupBuyId === o.groupBuyId).map(i => <p key={i.id}>{i.groupTitle}／{i.productName} × {i.quantity}</p>)}</details>)}
 {c.status === "AWAITING_PAYMENT" && <section className="space-y-4 rounded border p-4"><h2 className="text-xl font-bold">銀行轉帳／ATM</h2><p>{bank.bankName}（{bank.bankCode}）· {bank.bankAccount} · {bank.accountName}</p><p>期限：{c.expiresAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p><TransferForm checkoutId={c.id} expiresAt={c.expiresAt.toISOString()}/></section>}
 {c.payment?.reportedAt && <p>回報成功時間：{c.payment.reportedAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}。已停止付款倒數；庫存保留待核帳。</p>}
 {c.status === "ANOMALY" && <p>付款異常：{c.payment?.anomalyReason}。請聯絡 LINE 官方客服；補差額需經人工確認總入帳。</p>}
 {c.refunds.map(r => <p key={r.id}>待退款義務 NT${r.amount}（尚未執行退款）</p>)}
 <p>本系統採人工核帳，未自動核實銀行入帳。</p></div></CustomerPageShell>;
}
