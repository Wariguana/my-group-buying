import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { taipeiDisplayFormatter } from "@/lib/group-buys/time";
import { listAdminOrders } from "@/lib/orders/admin-service";
import { EmptyState, ErrorNotice, PageHeader, buttonStyles } from "@/components/ui/primitives";
import { OrderStatusBadge, PaymentStatusBadge, PickupStatusBadge } from "@/components/ui/status-badge";

const twdFormatter = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });

export default async function AdminOrdersPage() {
  await requireAdmin();
  const result = await listAdminOrders();

  return (
    <section>
      <PageHeader eyebrow="Orders" title="訂單管理" description="集中查看訂單狀態，並進入明細處理收款、取貨與取消作業。" />
      <div className="mt-7">
        {!result.ok ? <ErrorNotice>無法載入訂單，請稍後再試。</ErrorNotice> : result.value.length === 0 ? (
          <EmptyState title="目前尚無訂單資料。" description="顧客完成訂購後，訂單會顯示在這裡。" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[58rem] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                  <th scope="col" className="px-5 py-3.5 font-semibold">訂單</th><th scope="col" className="px-5 py-3.5 font-semibold">顧客</th><th scope="col" className="px-5 py-3.5 font-semibold">團購 / 金額</th><th scope="col" className="px-5 py-3.5 font-semibold">狀態</th><th scope="col" className="px-5 py-3.5 font-semibold">成立時間</th><th scope="col" className="px-5 py-3.5"><span className="sr-only">操作</span></th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {result.value.map((order) => <tr key={order.publicCode} className="align-top hover:bg-slate-50/70">
                    <td className="px-5 py-4"><p className="font-mono font-bold tracking-wide text-slate-950">{order.orderNumber}</p>{order.cancelledAt && <p className="mt-1 text-xs text-slate-500">取消時間：{taipeiDisplayFormatter.format(order.cancelledAt)}</p>}</td>
                    <td className="px-5 py-4"><p className="font-semibold text-slate-900">{order.customerName}</p><p className="mt-1 text-slate-500">{order.customerPhone}</p></td>
                    <td className="max-w-64 px-5 py-4"><p className="truncate font-medium text-slate-800">{order.groupBuy.title}</p><p className="mt-1 font-bold text-slate-950">{twdFormatter.format(order.totalAmount)}</p></td>
                    <td className="px-5 py-4"><div className="flex max-w-52 flex-wrap gap-1.5"><OrderStatusBadge status={order.status} />{order.status === "PLACED" && <><span className="sr-only">付款：{order.paidAt ? "已收款" : "尚未確認收款"}</span><PaymentStatusBadge paidAt={order.paidAt} /><PickupStatusBadge pickedUpAt={order.pickedUpAt} /></>}</div></td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">{taipeiDisplayFormatter.format(order.createdAt)}</td>
                    <td className="px-5 py-4 text-right"><Link href={`/admin/orders/${order.publicCode}`} className={buttonStyles.secondary}>查看訂單</Link></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
