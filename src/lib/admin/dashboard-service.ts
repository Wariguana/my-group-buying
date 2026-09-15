import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { getTaipeiCalendarDayBounds } from "@/lib/group-buys/time";

export const adminDashboardRecentOrderSelect = {
  publicCode: true,
  status: true,
  customerName: true,
  totalAmount: true,
  createdAt: true,
  paidAt: true,
  pickedUpAt: true,
  groupBuy: { select: { title: true } },
} satisfies Prisma.OrderSelect;

type SelectedRecentOrder = Prisma.OrderGetPayload<{
  select: typeof adminDashboardRecentOrderSelect;
}>;

export type AdminDashboardData = Readonly<{
  activeGroupBuyCount: number;
  unpaidOrderCount: number;
  awaitingPickupCount: number;
  todayOrderCount: number;
  recentOrders: readonly Readonly<SelectedRecentOrder>[];
}>;

export type AdminDashboardResult =
  | Readonly<{ ok: true; value: AdminDashboardData }>
  | Readonly<{ ok: false; error: "FAILED" }>;

export async function getAdminDashboard(now: Date = new Date()): Promise<AdminDashboardResult> {
  const { start, end } = getTaipeiCalendarDayBounds(now);

  try {
    const db = getDb();
    const [
      activeGroupBuyCount,
      unpaidOrderCount,
      awaitingPickupCount,
      todayOrderCount,
      recentOrders,
    ] = await Promise.all([
      db.groupBuy.count({
        where: {
          status: "PUBLISHED",
          startAt: { lte: now },
          endAt: { gt: now },
        },
      }),
      db.order.count({ where: { status: "PLACED", paidAt: null } }),
      db.order.count({ where: { status: "PLACED", pickedUpAt: null } }),
      db.order.count({ where: { createdAt: { gte: start, lt: end } } }),
      db.order.findMany({
        select: adminDashboardRecentOrderSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5,
      }),
    ]);

    return {
      ok: true,
      value: {
        activeGroupBuyCount,
        unpaidOrderCount,
        awaitingPickupCount,
        todayOrderCount,
        recentOrders,
      },
    };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}
