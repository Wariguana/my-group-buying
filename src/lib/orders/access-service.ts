import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  hashOrderAccessToken,
  isValidOrderAccessToken,
} from "@/lib/orders/access-token";
import { ORDER_PUBLIC_CODE_PATTERN } from "@/lib/orders/public-code";

export const ORDER_ACCESS_FAILURE_MESSAGE = "找不到訂單或訂單管理憑證無效。";

const customerOrderSelect = {
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
  pickedUpAt: true,
  paidAt: true,
  groupBuy: { select: { endAt: true } },
  items: {
    select: {
      productName: true,
      unit: true,
      unitPrice: true,
      quantity: true,
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.OrderSelect;

type SelectedCustomerOrder = Prisma.OrderGetPayload<{
  select: typeof customerOrderSelect;
}>;

export type CustomerOrderDetail = Readonly<{
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
  pickedUpAt: Date | null;
  paidAt: Date | null;
  canCancel: boolean;
  cancellationDeadline: Date;
  items: readonly Readonly<{
    productName: string;
    unit: string;
    unitPrice: number;
    quantity: number;
    lineSubtotal: number;
  }>[];
}>;

export type OrderAccessResult =
  | Readonly<{ ok: true; value: CustomerOrderDetail }>
  | Readonly<{ ok: false; message: typeof ORDER_ACCESS_FAILURE_MESSAGE }>;

function accessFailure(): OrderAccessResult {
  return { ok: false, message: ORDER_ACCESS_FAILURE_MESSAGE };
}

function safeProjection(
  order: SelectedCustomerOrder,
  now: Date,
): CustomerOrderDetail | null {
  if (order.status === "CANCELLED" && (order.cancelledAt === null || order.pickedUpAt !== null || order.paidAt !== null)) return null;
  const items = order.items.map((item) => {
    const lineSubtotal = item.unitPrice * item.quantity;
    if (
      !Number.isSafeInteger(item.unitPrice)
      || !Number.isSafeInteger(item.quantity)
      || !Number.isSafeInteger(lineSubtotal)
      || item.unitPrice < 0
      || item.quantity < 1
    ) {
      return null;
    }
    return {
      productName: item.productName,
      unit: item.unit,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineSubtotal,
    };
  });
  if (items.some((item) => item === null)) return null;

  return Object.freeze({
    publicCode: order.publicCode,
    status: order.status,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    pickupName: order.pickupName,
    pickupAddress: order.pickupAddress,
    pickupStartAt: order.pickupStartAt,
    pickupEndAt: order.pickupEndAt,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt,
    cancelledAt: order.cancelledAt,
    pickedUpAt: order.pickedUpAt,
    paidAt: order.paidAt,
    canCancel: order.status === "PLACED" && order.pickedUpAt === null && order.paidAt === null && now < order.groupBuy.endAt,
    cancellationDeadline: order.groupBuy.endAt,
    items: Object.freeze(items as CustomerOrderDetail["items"]),
  });
}

export async function getOrderForAccess(
  publicCode: unknown,
  rawToken: unknown,
): Promise<OrderAccessResult> {
  if (
    typeof publicCode !== "string"
    || !ORDER_PUBLIC_CODE_PATTERN.test(publicCode)
    || !isValidOrderAccessToken(rawToken)
  ) {
    return accessFailure();
  }

  try {
    const order = await getDb().order.findFirst({
      where: {
        publicCode,
        accessTokenHash: hashOrderAccessToken(rawToken),
      },
      select: customerOrderSelect,
    });
    if (!order) return accessFailure();
    const value = safeProjection(order, new Date());
    return value ? { ok: true, value } : accessFailure();
  } catch {
    return accessFailure();
  }
}
