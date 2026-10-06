"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { AdminOrderListInput } from "@/lib/orders/admin-list-query";
import { buildAdminOrderListUrl } from "@/lib/orders/admin-list-url";
import { buttonStyles, fieldStyles } from "@/components/ui/primitives";

export function AdminOrderListControls({ input }: Readonly<{ input: AdminOrderListInput }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    const orderNumber = formData.get("orderNumber");
    const status = formData.get("status");
    const fulfillment = formData.get("fulfillment");
    if (
      typeof orderNumber !== "string" || (orderNumber !== "" && !/^[0-9]{12}$/.test(orderNumber)) ||
      (status !== "" && status !== "PLACED" && status !== "CANCELLED") ||
      (fulfillment !== "" && fulfillment !== "SELF_PICKUP" && fulfillment !== "SEVEN_ELEVEN")
    ) {
      setError("請輸入完整的 12 位訂單編號，並選擇有效的篩選條件。");
      return;
    }
    if (input.queue && (status === "CANCELLED"
      || (input.queue === "SELF_PICKUP_PENDING" && fulfillment === "SEVEN_ELEVEN")
      || (input.queue.startsWith("SHIPMENT_") && fulfillment === "SELF_PICKUP"))) {
      setError("目前作業佇列與篩選條件不相容，請先選擇全部或清除條件。");
      return;
    }
    const next: AdminOrderListInput = {
      ...(orderNumber ? { orderNumber } : {}),
      ...(status ? { status } : {}),
      ...(fulfillment ? { fulfillment } : {}),
      ...(input.queue ? { queue: input.queue } : {}),
    };
    setError(null);
    startTransition(() => router.push(buildAdminOrderListUrl(next)));
  }

  const unpaidUrl = buildAdminOrderListUrl({
    ...(input.orderNumber ? { orderNumber: input.orderNumber } : {}),
    ...(input.fulfillment ? { fulfillment: input.fulfillment } : {}),
    queue: "UNPAID",
  });
  const selfPickupUrl = buildAdminOrderListUrl({
    ...(input.orderNumber ? { orderNumber: input.orderNumber } : {}),
    queue: "SELF_PICKUP_PENDING",
  });

  return (
    <div className="mt-7 space-y-4">
      <nav aria-label="訂單作業佇列" className="flex flex-wrap gap-2">
        <Link href="/admin/orders" prefetch={false} aria-current={!input.orderNumber && !input.status && !input.fulfillment && !input.queue ? "page" : undefined} className={buttonStyles.secondary}>全部</Link>
        <Link href={unpaidUrl} prefetch={false} aria-current={input.queue === "UNPAID" ? "page" : undefined} className={buttonStyles.secondary}>待收款</Link>
        <Link href={selfPickupUrl} prefetch={false} aria-current={input.queue === "SELF_PICKUP_PENDING" ? "page" : undefined} className={buttonStyles.secondary}>自取待取貨</Link>
        {([
          ["SHIPMENT_TO_CREATE", "待建立物流"], ["SHIPMENT_CREATED", "待寄出"],
          ["SHIPMENT_SHIPPED", "運送中"], ["SHIPMENT_ARRIVED", "已到店待取"],
          ["SHIPMENT_RETURNED", "退回待處理"],
        ] as const).map(([queue, label]) => <Link key={queue} href={buildAdminOrderListUrl({
          ...(input.orderNumber ? { orderNumber: input.orderNumber } : {}), queue,
        })} prefetch={false} aria-current={input.queue === queue ? "page" : undefined} className={buttonStyles.secondary}>{label}</Link>)}
      </nav>
      <form action="/admin/orders" method="get" onSubmit={search} aria-label="搜尋及篩選訂單" aria-busy={pending} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {input.queue && <input type="hidden" name="queue" value={input.queue} />}
        <fieldset disabled={pending} className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <label htmlFor="orderNumber" className="mb-1.5 block text-sm font-semibold text-slate-800">完整訂單編號</label>
            <input id="orderNumber" name="orderNumber" defaultValue={input.orderNumber ?? ""} inputMode="numeric" pattern="[0-9]{12}" maxLength={12} autoComplete="off" placeholder="例如：202610020001" aria-describedby="order-number-help" className={fieldStyles} />
          </div>
          <div className="min-w-0">
            <label htmlFor="order-status" className="mb-1.5 block text-sm font-semibold text-slate-800">訂單狀態</label>
            <select id="order-status" name="status" defaultValue={input.status ?? ""} className={fieldStyles}>
              <option value="">全部狀態</option><option value="PLACED">訂單成立</option><option value="CANCELLED">已取消</option>
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor="order-fulfillment" className="mb-1.5 block text-sm font-semibold text-slate-800">取貨方式</label>
            <select id="order-fulfillment" name="fulfillment" defaultValue={input.fulfillment ?? ""} className={fieldStyles}>
              <option value="">全部方式</option><option value="SELF_PICKUP">自取</option><option value="SEVEN_ELEVEN">7-ELEVEN</option>
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button type="submit" disabled={pending} className={buttonStyles.primary}>{pending ? "搜尋中…" : "搜尋"}</button>
            <Link href="/admin/orders" prefetch={false} className={buttonStyles.secondary}>清除</Link>
          </div>
        </fieldset>
        <p id="order-number-help" className="mt-3 text-xs leading-5 text-slate-500">只搜尋完整訂單編號；留空可依條件查看。變更搜尋或篩選條件後，會回到最新一批。</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      </form>
    </div>
  );
}
