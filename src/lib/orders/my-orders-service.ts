import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const myOrderSelect = {
  publicCode: true,
  orderNumber: true,
  status: true,
  fulfillmentMethod: true,
  pickupName: true,
  pickupAddress: true,
  sevenElevenStoreId: true,
  sevenElevenStoreName: true,
  sevenElevenStoreAddress: true,
  totalAmount: true,
  createdAt: true,
  groupBuy: { select: { title: true } },
} satisfies Prisma.OrderSelect;

export type MyOrderSummary = Prisma.OrderGetPayload<{ select: typeof myOrderSelect }>;

export async function listMyOrders(customerAccountId: unknown): Promise<readonly MyOrderSummary[]> {
  if (typeof customerAccountId !== "string" || !UUID_PATTERN.test(customerAccountId)) return [];

  return getDb().order.findMany({
    where: { customerAccountId },
    select: myOrderSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}
