import type { AdminOrderDetail, AdminCancellationBlockReason, PickupBlockReason, ShipmentCreationBlockReason } from "@/lib/orders/admin-service";
import { taipeiDisplayFormatter } from "@/lib/group-buys/time";
import { Card, Detail, DetailList, Section } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ShipmentState } from "@/lib/shipments/state";
import { AdminCreateShipmentForm, AdminShipmentTransitionForm } from "./shipment-forms";

const stateLabels: Record<ShipmentState, string> = {
  CREATED: "已建立", SHIPPED: "已寄出", ARRIVED: "已到店", PICKED_UP: "已取貨", RETURNED: "已退回", VOIDED: "已作廢",
};
const creationMessages: Record<ShipmentCreationBlockReason, string> = {
  NOT_REQUIRED: "此訂單不需建立物流紀錄。", CANCELLED: "訂單已取消，物流紀錄僅供查閱。",
  PICKED_UP: "訂單已取貨，物流紀錄僅供查閱。", BEFORE_CUTOFF: "團購截止後才能建立物流紀錄；截止後請重新整理頁面。",
  ACTIVE_SHIPMENT: "請操作目前進行中的物流紀錄。",
};
export const pickupBlockMessages: Record<PickupBlockReason, string> = {
  CANCELLED: "已取消的訂單無法取貨。", PICKED_UP: "訂單已取貨。", SHIPMENT_NOT_ARRIVED: "物流尚未到店，無法標記取貨。",
};
export const cancellationBlockMessages: Record<AdminCancellationBlockReason, string> = {
  CANCELLED: "訂單已取消。", PICKED_UP: "訂單已取貨，無法取消。", PAID: "訂單已確認收款，無法取消。",
  RETURNED_HISTORY: "訂單有退回紀錄，退回庫存處置尚未解決，目前無法取消訂單。",
  CREATED_SHIPMENT: "請先在外部 MyShip 作廢物流，再於本系統記錄作廢，才能依訂單狀態取消。",
  ACTIVE_SHIPMENT: "進行中的物流阻擋取消；已寄出或到店的物流無法作廢。",
};

export function AdminShipmentSection({ order }: Readonly<{ order: AdminOrderDetail }>) {
  if (order.fulfillmentMethod !== "SEVEN_ELEVEN") return null;
  if (!order.shipmentRequired) return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">此訂單沿用原有取貨流程，不需建立物流紀錄。</p>;
  return (
    <Card className="min-w-0 p-5 sm:p-6">
      <Section title="物流紀錄" description="管理員手動登錄的外部寄件紀錄；不會自動查詢物流狀態。">
        {order.shipmentHistory.length === 0 ? <div className="space-y-4"><p className="text-sm text-slate-600">尚無物流紀錄。</p><DetailList><Detail label="物流業者">7-ELEVEN MyShip／交貨便</Detail><Detail label="收件人">{order.customerName}</Detail><Detail label="收件手機">{order.customerPhone}</Detail><Detail label="收件門市">{order.sevenElevenStoreName}</Detail><Detail label="店號">{order.sevenElevenStoreId}</Detail><Detail label="門市地址">{order.sevenElevenStoreAddress}</Detail></DetailList></div> : (
          <ol className="space-y-5" aria-label="物流歷史紀錄">
            {order.shipmentHistory.map((row, index) => <li key={`${row.provider}-${row.trackingNumber}`} className="min-w-0 rounded-lg border border-slate-200 p-4">
              <div className="mb-4 flex flex-wrap items-center gap-2"><h3 className="font-semibold">物流紀錄 {index + 1}</h3><StatusBadge>{stateLabels[row.state]}</StatusBadge>{row.isCurrent && <span className="text-xs text-slate-500">目前物流</span>}</div>
              <DetailList><Detail label="物流業者">7-ELEVEN MyShip／交貨便</Detail><Detail label="物流編號"><span className="break-all">{row.trackingNumber}</span></Detail><Detail label="收件人">{row.recipientName}</Detail><Detail label="收件手機">{row.recipientPhone}</Detail><Detail label="收件門市">{row.sevenElevenStoreName}</Detail><Detail label="店號">{row.sevenElevenStoreId}</Detail><Detail label="門市地址"><span className="break-all">{row.sevenElevenStoreAddress}</span></Detail><Detail label="建立時間">{taipeiDisplayFormatter.format(row.createdAt)}</Detail>
                {row.shippedAt && <Detail label="寄出記錄時間">{taipeiDisplayFormatter.format(row.shippedAt)}</Detail>}{row.arrivedAt && <Detail label="到店記錄時間">{taipeiDisplayFormatter.format(row.arrivedAt)}</Detail>}{row.returnedAt && <Detail label="退回記錄時間">{taipeiDisplayFormatter.format(row.returnedAt)}</Detail>}{row.voidedAt && <Detail label="作廢記錄時間">{taipeiDisplayFormatter.format(row.voidedAt)}</Detail>}
              </DetailList>
            </li>)}
          </ol>
        )}
        {order.shipmentHistory.some((row) => row.state === "RETURNED") && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">退回紀錄不會自動回補訂單庫存，目前無法取消訂單。符合條件時可登錄新的替代物流。</p>}
      </Section>
    </Card>
  );
}

export function AdminShipmentOperations({ order }: Readonly<{ order: AdminOrderDetail }>) {
  if (!order.shipmentRequired) return null;
  return <Card className="min-w-0 p-5"><Section title="物流作業">
    {order.canCreateShipment ? <AdminCreateShipmentForm key={`${order.publicCode}-${order.shipmentHistory.length}`} publicCode={order.publicCode} /> : <p className="text-sm text-slate-600">{order.shipmentCreationBlockReason && creationMessages[order.shipmentCreationBlockReason]}</p>}
    {order.activeShipmentId && <div className="mt-4 space-y-4">{order.allowedShipmentActions.map((operation) => <AdminShipmentTransitionForm key={`${order.activeShipmentId}-${operation}`} shipmentId={order.activeShipmentId!} operation={operation} />)}</div>}
  </Section></Card>;
}
