import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { taipeiDisplayFormatter } from "@/lib/group-buys/time";
import { listAdminOrders } from "@/lib/orders/admin-service";
import { parseAdminOrderListSearchParams, type AdminOrderListInput } from "@/lib/orders/admin-list-query";
import { buildAdminOrderListUrl } from "@/lib/orders/admin-list-url";
import { EmptyState, ErrorNotice, PageHeader, buttonStyles } from "@/components/ui/primitives";
import { OrderStatusBadge, PaymentStatusBadge, PickupStatusBadge } from "@/components/ui/status-badge";
import { AdminOrderListControls } from "./list-controls";

const twdFormatter = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireAdmin();
  const parsed = parseAdminOrderListSearchParams(await searchParams);
  const input: AdminOrderListInput = parsed.ok ? parsed.value : {};
  const result = parsed.ok ? await listAdminOrders(input) : { ok: false, error: "INVALID_QUERY" } as const;
  const latestInput = { ...input, navigation: undefined };
  const latestUrl = buildAdminOrderListUrl(latestInput);
  const filtered = Boolean(input.orderNumber || input.status || input.fulfillment || input.queue);

  return (
    <section>
      <PageHeader eyebrow="Orders" title="訂單管理" description="集中查看訂單狀態，並進入明細處理收款、取貨與取消作業。" />
      <AdminOrderListControls key={buildAdminOrderListUrl(input)} input={input} />
      <div className="mt-7">
        {!result.ok ? (
          <div className="space-y-4">
            <ErrorNotice>{result.error === "INVALID_QUERY" ? "查詢條件無效，請清除條件後重新搜尋。" : result.error === "INVALID_CURSOR" ? "分頁位置無效或已不存在，請回最新一批。" : "無法載入訂單，請稍後再試。"}</ErrorNotice>
            <Link href={result.error === "INVALID_QUERY" ? "/admin/orders" : result.error === "INVALID_CURSOR" ? latestUrl : buildAdminOrderListUrl(input)} prefetch={false} className={buttonStyles.secondary}>{result.error === "INVALID_QUERY" ? "清除條件" : result.error === "INVALID_CURSOR" ? "回最新" : "重試"}</Link>
          </div>
        ) : result.value.items.length === 0 ? (
          <EmptyState
            title={input.navigation ? "這個排序位置沒有訂單。" : filtered ? "目前搜尋或篩選條件沒有符合的訂單。" : "目前尚無訂單資料。"}
            description={input.navigation ? "可回最新一批繼續查看目前條件下的訂單。" : filtered ? "請調整搜尋或篩選條件後再試。" : "顧客完成訂購後，訂單會顯示在這裡。"}
            action={input.navigation ? <Link href={latestUrl} prefetch={false} className={buttonStyles.secondary}>回最新</Link> : filtered ? <Link href="/admin/orders" prefetch={false} className={buttonStyles.secondary}>清除條件</Link> : undefined}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div role="region" aria-label="訂單列表" tabIndex={0} className="relative overflow-x-auto">
              <table className="w-full min-w-[58rem] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                  <th scope="col" className="px-5 py-3.5 font-semibold">訂單</th><th scope="col" className="px-5 py-3.5 font-semibold">顧客</th><th scope="col" className="px-5 py-3.5 font-semibold">團購 / 金額</th><th scope="col" className="px-5 py-3.5 font-semibold">取貨方式</th><th scope="col" className="px-5 py-3.5 font-semibold">狀態</th><th scope="col" className="px-5 py-3.5 font-semibold">成立時間</th><th scope="col" className="px-5 py-3.5"><span className="sr-only">操作</span></th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {result.value.items.map((order) => <tr key={order.publicCode} className="align-top hover:bg-slate-50/70">
                    <td className="px-5 py-4"><p className="font-mono font-bold tracking-wide text-slate-950">{order.orderNumber}</p>{order.cancelledAt && <p className="mt-1 text-xs text-slate-500">取消時間：{taipeiDisplayFormatter.format(order.cancelledAt)}</p>}</td>
                    <td className="px-5 py-4"><p className="font-semibold text-slate-900">{order.customerName}</p><p className="mt-1 text-slate-500">{order.customerPhone}</p></td>
                    <td className="max-w-64 px-5 py-4"><p className="truncate font-medium text-slate-800">{order.groupBuy.title}</p><p className="mt-1 font-bold text-slate-950">{twdFormatter.format(order.totalAmount)}</p></td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-700">{order.fulfillmentMethod === "SELF_PICKUP" ? "自取" : "7-ELEVEN"}</td>
                    <td className="px-5 py-4"><div className="flex max-w-52 flex-wrap gap-1.5"><OrderStatusBadge status={order.status} />{order.status === "PLACED" && <><span className="sr-only">付款：{order.paidAt ? "已收款" : "尚未確認收款"}</span><PaymentStatusBadge paidAt={order.paidAt} /><PickupStatusBadge pickedUpAt={order.pickedUpAt} /></>}</div></td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">{taipeiDisplayFormatter.format(order.createdAt)}</td>
                    <td className="px-5 py-4 text-right"><Link href={`/admin/orders/${order.publicCode}`} className={buttonStyles.secondary}>查看訂單</Link></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {result.ok && <nav aria-label="訂單分頁" className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">本頁 {result.value.returnedCount} 筆</p>
          <div className="flex flex-wrap gap-2">
            {result.value.hasNewer && result.value.newerCursor ? <Link href={buildAdminOrderListUrl({ ...latestInput, navigation: { direction: "NEWER", anchorPublicCode: result.value.newerCursor } })} prefetch={false} className={buttonStyles.secondary}>上一批</Link> : <button type="button" disabled className={buttonStyles.secondary}>上一批</button>}
            {result.value.hasOlder && result.value.olderCursor ? <Link href={buildAdminOrderListUrl({ ...latestInput, navigation: { direction: "OLDER", anchorPublicCode: result.value.olderCursor } })} prefetch={false} className={buttonStyles.secondary}>下一批</Link> : <button type="button" disabled className={buttonStyles.secondary}>下一批</button>}
            {!input.navigation || result.value.items.length > 0 ? <Link href={latestUrl} prefetch={false} className={buttonStyles.secondary}>回最新</Link> : null}
          </div>
        </nav>}
      </div>
    </section>
  );
}
