import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { ORDER_PUBLIC_CODE_PATTERN } from "@/lib/orders/public-code";
import { ORDER_NUMBER_PATTERN } from "@/lib/orders/order-number";
import { deriveShipmentState, type ShipmentState } from "@/lib/shipments/state";

export type AdminOrderErrorCode = "NOT_FOUND" | "FAILED";

export type AdminOrderResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: AdminOrderErrorCode }>;

export const adminOrderListSelect = {
  publicCode: true,
  orderNumber: true,
  status: true,
  fulfillmentMethod: true,
  customerName: true,
  customerPhone: true,
  totalAmount: true,
  createdAt: true,
  cancelledAt: true,
  pickedUpAt: true,
  paidAt: true,
  groupBuy: { select: { title: true } },
} satisfies Prisma.OrderSelect;

export const adminOrderDetailSelect = {
  publicCode: true,
  orderNumber: true,
  status: true,
  fulfillmentMethod: true,
  groupBuyPickupId: true,
  customerName: true,
  customerPhone: true,
  pickupName: true,
  pickupAddress: true,
  pickupStartAt: true,
  pickupEndAt: true,
  sevenElevenStoreId: true,
  sevenElevenStoreName: true,
  sevenElevenStoreAddress: true,
  totalAmount: true,
  createdAt: true,
  cancelledAt: true,
  pickedUpAt: true,
  paidAt: true,
  shipmentRequired: true,
  shipments: {
    select: {
      id: true, provider: true, trackingNumber: true,
      recipientName: true, recipientPhone: true,
      sevenElevenStoreId: true, sevenElevenStoreName: true, sevenElevenStoreAddress: true,
      createdAt: true, shippedAt: true, arrivedAt: true, returnedAt: true, voidedAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  groupBuy: {
    select: {
      title: true,
      startAt: true,
      endAt: true,
    },
  },
  items: {
    select: {
      productName: true,
      unit: true,
      unitPrice: true,
      quantity: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.OrderSelect;

type SelectedAdminOrderListItem = Prisma.OrderGetPayload<{
  select: typeof adminOrderListSelect;
}>;
type SelectedAdminOrderDetail = Prisma.OrderGetPayload<{
  select: typeof adminOrderDetailSelect;
}>;

export type AdminOrderListItem = Readonly<SelectedAdminOrderListItem>;

export type AdminShipmentAction = "SHIP" | "ARRIVE" | "RETURN" | "VOID";
export type ShipmentCreationBlockReason = "NOT_REQUIRED" | "CANCELLED" | "PICKED_UP" | "BEFORE_CUTOFF" | "ACTIVE_SHIPMENT";
export type PickupBlockReason = "CANCELLED" | "PICKED_UP" | "SHIPMENT_NOT_ARRIVED";
export type AdminCancellationBlockReason = "CANCELLED" | "PICKED_UP" | "PAID" | "RETURNED_HISTORY" | "CREATED_SHIPMENT" | "ACTIVE_SHIPMENT";
export type AdminShipmentHistoryEntry = Readonly<{
  state: ShipmentState;
  isCurrent: boolean;
  provider: "SEVEN_ELEVEN_MYSHIP";
  trackingNumber: string;
  recipientName: string;
  recipientPhone: string;
  sevenElevenStoreId: string;
  sevenElevenStoreName: string;
  sevenElevenStoreAddress: string;
  createdAt: Date;
  shippedAt: Date | null;
  arrivedAt: Date | null;
  returnedAt: Date | null;
  voidedAt: Date | null;
}>;

export type AdminOrderDetail = Readonly<{
  publicCode: string;
  orderNumber: string;
  status: "PLACED" | "CANCELLED";
  fulfillmentMethod: "SELF_PICKUP" | "SEVEN_ELEVEN";
  customerName: string;
  customerPhone: string;
  pickupName: string | null;
  pickupAddress: string | null;
  pickupStartAt: Date | null;
  pickupEndAt: Date | null;
  sevenElevenStoreId: string | null;
  sevenElevenStoreName: string | null;
  sevenElevenStoreAddress: string | null;
  totalAmount: number;
  createdAt: Date;
  cancelledAt: Date | null;
  pickedUpAt: Date | null;
  paidAt: Date | null;
  shipmentRequired: boolean;
  shipmentHistory: readonly AdminShipmentHistoryEntry[];
  activeShipmentId: string | null;
  canCreateShipment: boolean;
  shipmentCreationBlockReason: ShipmentCreationBlockReason | null;
  allowedShipmentActions: readonly AdminShipmentAction[];
  canMarkPickedUp: boolean;
  pickupBlockReason: PickupBlockReason | null;
  canAdminCancel: boolean;
  adminCancellationBlockReason: AdminCancellationBlockReason | null;
  groupBuy: Readonly<{
    title: string;
    startAt: Date;
    endAt: Date;
  }>;
  items: readonly Readonly<{
    productName: string;
    unit: string;
    unitPrice: number;
    quantity: number;
    lineSubtotal: number;
  }>[];
}>;

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function nonblank(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

// Advisory read projection only. Locked mutation services remain authoritative;
// integration parity tests keep this single projection aligned with their policy.
function projectOperations(order: SelectedAdminOrderDetail, now: Date) {
  if (typeof order.shipmentRequired !== "boolean" || !validDate(order.groupBuy.endAt)) return null;
  if (order.shipmentRequired && (order.fulfillmentMethod !== "SEVEN_ELEVEN" ||
      ![order.customerName, order.customerPhone, order.sevenElevenStoreId,
        order.sevenElevenStoreName, order.sevenElevenStoreAddress].every(nonblank))) return null;
  const history = order.shipments;
  if (!order.shipmentRequired && history.length > 0) return null;
  for (const row of history) {
    if (row.provider !== "SEVEN_ELEVEN_MYSHIP" || !nonblank(row.trackingNumber) ||
        row.trackingNumber !== row.trackingNumber.trim() || row.trackingNumber.length > 128 ||
        ![row.recipientName, row.recipientPhone, row.sevenElevenStoreId,
          row.sevenElevenStoreName, row.sevenElevenStoreAddress].every(nonblank) ||
        !validDate(row.createdAt) ||
        [row.shippedAt, row.arrivedAt, row.returnedAt, row.voidedAt].some((date) => date !== null && !validDate(date)) ||
        (row.shippedAt !== null && row.shippedAt < row.createdAt) ||
        (row.voidedAt !== null && row.voidedAt < row.createdAt) ||
        (row.arrivedAt !== null && (row.shippedAt === null || row.arrivedAt < row.shippedAt)) ||
        (row.returnedAt !== null && (row.shippedAt === null || row.returnedAt < row.shippedAt ||
          (row.arrivedAt !== null && row.returnedAt < row.arrivedAt))) ||
        (row.voidedAt !== null && (row.shippedAt !== null || row.arrivedAt !== null || row.returnedAt !== null))) return null;
  }
  const open = history.filter((row) => row.returnedAt === null && row.voidedAt === null);
  if (open.length > 1) return null;
  const current = open[0] ?? null;
  const hasReturned = history.some((row) => row.returnedAt !== null);
  if (order.shipmentRequired && order.pickedUpAt !== null &&
      (!validDate(order.pickedUpAt) || !current || current.shippedAt === null || current.arrivedAt === null ||
        order.pickedUpAt < current.arrivedAt)) return null;
  if (order.shipmentRequired && order.status === "CANCELLED" &&
      (current || hasReturned || order.cancelledAt === null || !validDate(order.cancelledAt) ||
        history.some((row) => row.voidedAt !== null && row.voidedAt > order.cancelledAt!))) return null;

  const shipmentHistory = Object.freeze(history.map((row) => Object.freeze({
    state: deriveShipmentState(row, { pickedUpAt: order.pickedUpAt,
      activeShipmentId: current?.id ?? null, shipmentRequired: order.shipmentRequired }),
    isCurrent: row.id === current?.id,
    provider: row.provider, trackingNumber: row.trackingNumber,
    recipientName: row.recipientName, recipientPhone: row.recipientPhone,
    sevenElevenStoreId: row.sevenElevenStoreId, sevenElevenStoreName: row.sevenElevenStoreName,
    sevenElevenStoreAddress: row.sevenElevenStoreAddress,
    createdAt: row.createdAt, shippedAt: row.shippedAt, arrivedAt: row.arrivedAt,
    returnedAt: row.returnedAt, voidedAt: row.voidedAt,
  })));
  const currentState = shipmentHistory.find((row) => row.isCurrent)?.state;
  const shipmentCreationBlockReason: ShipmentCreationBlockReason | null = !order.shipmentRequired ? "NOT_REQUIRED"
    : order.status === "CANCELLED" ? "CANCELLED" : order.pickedUpAt !== null ? "PICKED_UP"
    : current ? "ACTIVE_SHIPMENT" : now < order.groupBuy.endAt ? "BEFORE_CUTOFF" : null;
  const allowedShipmentActions: AdminShipmentAction[] = order.shipmentRequired && order.status === "PLACED" && order.pickedUpAt === null
    ? currentState === "CREATED" ? ["SHIP", "VOID"] : currentState === "SHIPPED" ? ["ARRIVE", "RETURN"]
      : currentState === "ARRIVED" ? ["RETURN"] : []
    : [];
  const pickupBlockReason: PickupBlockReason | null = order.status === "CANCELLED" ? "CANCELLED"
    : order.pickedUpAt !== null ? "PICKED_UP"
    : order.shipmentRequired && currentState !== "ARRIVED" ? "SHIPMENT_NOT_ARRIVED" : null;
  const adminCancellationBlockReason: AdminCancellationBlockReason | null = order.status === "CANCELLED" ? "CANCELLED"
    : order.pickedUpAt !== null ? "PICKED_UP" : order.paidAt !== null ? "PAID"
    : order.shipmentRequired && hasReturned ? "RETURNED_HISTORY"
    : order.shipmentRequired && current ? currentState === "CREATED" ? "CREATED_SHIPMENT" : "ACTIVE_SHIPMENT" : null;
  return {
    shipmentRequired: order.shipmentRequired, shipmentHistory,
    // Read-only histories need no database IDs in the UI.
    activeShipmentId: allowedShipmentActions.length > 0 ? current?.id ?? null : null,
    canCreateShipment: shipmentCreationBlockReason === null, shipmentCreationBlockReason,
    allowedShipmentActions: Object.freeze(allowedShipmentActions),
    canMarkPickedUp: pickupBlockReason === null, pickupBlockReason,
    canAdminCancel: adminCancellationBlockReason === null, adminCancellationBlockReason,
  };
}

function projectDetail(order: SelectedAdminOrderDetail): AdminOrderDetail | null {
  const fulfillmentMethod = order.fulfillmentMethod ?? "SELF_PICKUP";
  const validSelfPickup = fulfillmentMethod === "SELF_PICKUP"
    && order.groupBuyPickupId !== null
    && order.pickupName !== null
    && order.pickupAddress !== null
    && order.sevenElevenStoreId == null
    && order.sevenElevenStoreName == null
    && order.sevenElevenStoreAddress == null;
  const validSevenEleven = fulfillmentMethod === "SEVEN_ELEVEN"
    && order.groupBuyPickupId === null
    && order.pickupName === null
    && order.pickupAddress === null
    && order.pickupStartAt === null
    && order.pickupEndAt === null
    && order.sevenElevenStoreId !== null
    && order.sevenElevenStoreName !== null
    && order.sevenElevenStoreAddress !== null;
  if (
    !ORDER_NUMBER_PATTERN.test(order.orderNumber)
    || !Number.isSafeInteger(order.totalAmount)
    || order.totalAmount < 0
    || (order.status === "CANCELLED" && (order.cancelledAt === null || order.pickedUpAt !== null || order.paidAt !== null))
    || (!validSelfPickup && !validSevenEleven)
    || (order.status === "PLACED" && order.cancelledAt !== null)
  ) {
    return null;
  }

  const items = order.items.map((item) => {
    const lineSubtotal = item.unitPrice * item.quantity;
    if (
      !Number.isSafeInteger(item.unitPrice)
      || item.unitPrice < 0
      || !Number.isSafeInteger(item.quantity)
      || item.quantity < 1
      || !Number.isSafeInteger(lineSubtotal)
    ) {
      return null;
    }
    return Object.freeze({ ...item, lineSubtotal });
  });
  if (items.some((item) => item === null)) return null;
  const operations = projectOperations(order, new Date());
  if (!operations) return null;

  return Object.freeze({
    publicCode: order.publicCode, orderNumber: order.orderNumber, status: order.status,
    fulfillmentMethod,
    customerName: order.customerName, customerPhone: order.customerPhone,
    pickupName: order.pickupName, pickupAddress: order.pickupAddress,
    pickupStartAt: order.pickupStartAt, pickupEndAt: order.pickupEndAt,
    totalAmount: order.totalAmount, createdAt: order.createdAt, cancelledAt: order.cancelledAt,
    pickedUpAt: order.pickedUpAt, paidAt: order.paidAt,
    ...operations,
    sevenElevenStoreId: order.sevenElevenStoreId ?? null,
    sevenElevenStoreName: order.sevenElevenStoreName ?? null,
    sevenElevenStoreAddress: order.sevenElevenStoreAddress ?? null,
    groupBuy: Object.freeze(order.groupBuy),
    items: Object.freeze(items as AdminOrderDetail["items"]),
  });
}

export async function listAdminOrders(): Promise<AdminOrderResult<AdminOrderListItem[]>> {
  try {
    const orders = await getDb().order.findMany({
      select: adminOrderListSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (orders.some((order) =>
      !ORDER_NUMBER_PATTERN.test(order.orderNumber)
      || (order.status === "CANCELLED" && (order.cancelledAt === null || order.pickedUpAt !== null || order.paidAt !== null)))) {
      return { ok: false, error: "FAILED" };
    }
    return { ok: true, value: orders };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function getAdminOrderByPublicCode(
  publicCode: unknown,
): Promise<AdminOrderResult<AdminOrderDetail>> {
  if (
    typeof publicCode !== "string"
    || !ORDER_PUBLIC_CODE_PATTERN.test(publicCode)
  ) {
    return { ok: false, error: "NOT_FOUND" };
  }

  try {
    const order = await getDb().order.findUnique({
      where: { publicCode },
      select: adminOrderDetailSelect,
    });
    if (!order) return { ok: false, error: "NOT_FOUND" };
    const value = projectDetail(order);
    return value
      ? { ok: true, value }
      : { ok: false, error: "FAILED" };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}
