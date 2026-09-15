import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import { taipeiDisplayFormatter } from "@/lib/group-buys/time";
import { getAdminOrderByPublicCode } from "@/lib/orders/admin-service";
import { Card, Detail, DetailList, ErrorNotice, PageHeader, Section, buttonStyles } from "@/components/ui/primitives";
import { OrderStatusBadge, PaymentStatusBadge, PickupStatusBadge } from "@/components/ui/status-badge";
import { AdminPickupOrderForm } from "./pickup-form";
import { AdminCancelOrderForm } from "./cancel-form";
import { AdminPaymentOrderForm } from "./payment-form";

const twdFormatter = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });
const formatOptionalDate = (value: Date | null) => value ? taipeiDisplayFormatter.format(value) : "另行通知";

export default async function AdminOrderDetailPage({ params }: PageProps<"/admin/orders/[publicCode]">) {
  await requireAdmin();
  const { publicCode } = await params;
  const result = await getAdminOrderByPublicCode(publicCode);
  if (!result.ok && result.error === "NOT_FOUND") notFound();
  if (!result.ok) return <ErrorNotice>無法載入訂單，請稍後再試。</ErrorNotice>;

  const order = result.value;
  return (
    <section>
      <Link href="/admin/orders" className={buttonStyles.textAction}>‹ 返回訂單列表</Link>
      <div className="mt-5">
        <PageHeader eyebrow="Order detail" title={order.publicCode} description={`團購：${order.groupBuy.title}`} actions={<div className="flex flex-wrap gap-2"><OrderStatusBadge status={order.status} />{order.status === "PLACED" && <><PaymentStatusBadge paidAt={order.paidAt} /><PickupStatusBadge pickedUpAt={order.pickedUpAt} /></>}</div>} />
      </div>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,0.8fr)]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <p className="sr-only">訂單總額：{twdFormatter.format(order.totalAmount)}</p>
            <DetailList>
              <Detail label="訂單總額" prominent>{twdFormatter.format(order.totalAmount)}</Detail>
              <Detail label="成立時間">{taipeiDisplayFormatter.format(order.createdAt)}</Detail>
              <Detail label="訂購人">{order.customerName}</Detail>
              <Detail label="手機">{order.customerPhone}</Detail>
              <Detail label="訂購期間">{taipeiDisplayFormatter.format(order.groupBuy.startAt)}－{taipeiDisplayFormatter.format(order.groupBuy.endAt)}</Detail>
              {order.cancelledAt && <Detail label="取消時間">{taipeiDisplayFormatter.format(order.cancelledAt)}</Detail>}
            </DetailList>
          </Card>

          <Card className="p-5 sm:p-6">
            <Section title="取貨資訊" description="建立訂單當下保存的取貨資料快照。">
              <DetailList>
                <Detail label="取貨地點">{order.pickupName}</Detail><Detail label="取貨地址">{order.pickupAddress}</Detail>
                <Detail label="取貨開始">{formatOptionalDate(order.pickupStartAt)}</Detail><Detail label="取貨結束">{formatOptionalDate(order.pickupEndAt)}</Detail>
              </DetailList>
              {order.status === "PLACED" && <p className="mt-5 rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-700">{order.pickedUpAt ? `已取貨：${taipeiDisplayFormatter.format(order.pickedUpAt)}` : "待取貨"}</p>}
            </Section>
          </Card>

          <Card className="p-5 sm:p-6">
            <Section title="付款資訊">
              {order.status === "PLACED" ? <div className="space-y-2"><p className="font-semibold text-slate-800">付款：{order.paidAt ? "已收款" : "尚未確認收款"}</p>{order.paidAt && <p className="text-sm text-slate-600">收款確認時間：{taipeiDisplayFormatter.format(order.paidAt)}</p>}</div> : <p className="text-sm text-slate-600">已取消訂單不顯示付款作業。</p>}
            </Section>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4 sm:px-6"><h2 id="admin-order-items-heading" className="text-lg font-bold">訂單商品</h2></div>
            <div className="overflow-x-auto"><table aria-labelledby="admin-order-items-heading" className="w-full min-w-[34rem] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3 font-semibold">商品</th><th className="px-5 py-3 font-semibold">單價</th><th className="px-5 py-3 text-right font-semibold">數量</th><th className="px-5 py-3 text-right font-semibold">小計</th></tr></thead><tbody className="divide-y divide-slate-100">{order.items.map((item, index) => <tr key={`${item.productName}-${item.unit}-${index}`}><td className="px-5 py-4 font-semibold"><span>{item.productName}</span><span className="ml-2 text-xs font-normal text-slate-500">／{item.unit}</span><span className="sr-only">× {item.quantity}</span></td><td className="px-5 py-4">{twdFormatter.format(item.unitPrice)}</td><td className="px-5 py-4 text-right">{item.quantity}</td><td className="px-5 py-4 text-right font-bold">{twdFormatter.format(item.lineSubtotal)}</td></tr>)}</tbody><tfoot className="border-t border-slate-200 bg-slate-50"><tr><th colSpan={3} className="px-5 py-4 text-right font-semibold">訂單總額</th><td className="px-5 py-4 text-right text-lg font-bold">{twdFormatter.format(order.totalAmount)}</td></tr></tfoot></table></div>
          </Card>
        </div>

        <aside className="space-y-5">
          {order.status === "PLACED" && order.paidAt === null && <Card className="p-5"><Section title="確認收款" description="請核對全額款項後再執行。"><AdminPaymentOrderForm publicCode={order.publicCode} totalAmount={order.totalAmount} /></Section></Card>}
          {order.status === "PLACED" && order.paidAt !== null && <Card className="p-5"><p className="text-sm font-medium text-slate-700">訂單已確認收款，無法取消。</p></Card>}
          {order.status === "PLACED" && order.pickedUpAt === null && <Card className="p-5"><Section title="完成取貨" description="商品交付給顧客後標記。">{order.paidAt === null && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-900">尚未確認收款，仍可標記已取貨。</p>}<AdminPickupOrderForm publicCode={order.publicCode} /></Section></Card>}
          {order.status === "PLACED" && order.pickedUpAt === null && order.paidAt === null && <div className="rounded-xl border border-red-200 bg-red-50/50 p-5"><Section title="危險操作" description="取消後無法復原，請確認狀況後執行。"><AdminCancelOrderForm publicCode={order.publicCode} /></Section></div>}
          <Link href="/admin/orders" className={`${buttonStyles.secondary} w-full`}>返回訂單列表</Link>
        </aside>
      </div>
    </section>
  );
}
