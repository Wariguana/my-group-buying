import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { ORDER_PUBLIC_CODE_PATTERN } from "@/lib/orders/public-code";

export type AdminOrderErrorCode = "NOT_FOUND" | "FAILED";

export type AdminOrderResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: AdminOrderErrorCode }>;

export const adminOrderListSelect = {
  publicCode: true,
  status: true,
  customerName: true,
  customerPhone: true,
  totalAmount: true,
  createdAt: true,
  cancelledAt: true,
  groupBuy: { select: { title: true } },
} satisfies Prisma.OrderSelect;

export const adminOrderDetailSelect = {
  publicCode: true,
  status: true,
  customerName: true,
  customerPhone: true,
  pickupName: true,
  pickupAddress: true,
  pickupStartAt: true,
  pickupEndAt: true,
  totalAmount: true,
  createdAt: true,
  cancelledAt: true,
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

export type AdminOrderDetail = Readonly<{
  publicCode: string;
  status: "PLACED" | "CANCELLED";
  customerName: string;
  customerPhone: string;
  pickupName: string;
  pickupAddress: string;
  pickupStartAt: Date | null;
  pickupEndAt: Date | null;
  totalAmount: number;
  createdAt: Date;
  cancelledAt: Date | null;
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

function projectDetail(order: SelectedAdminOrderDetail): AdminOrderDetail | null {
  if (
    !Number.isSafeInteger(order.totalAmount)
    || order.totalAmount < 0
    || (order.status === "CANCELLED" && order.cancelledAt === null)
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

  return Object.freeze({
    ...order,
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
