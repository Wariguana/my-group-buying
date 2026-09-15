// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  groupBuyCount: vi.fn(),
  orderCount: vi.fn(),
  orderFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    groupBuy: { count: boundary.groupBuyCount },
    order: { count: boundary.orderCount, findMany: boundary.orderFindMany },
  }),
}));

import {
  adminDashboardRecentOrderSelect,
  getAdminDashboard,
} from "@/lib/admin/dashboard-service";
import { getTaipeiCalendarDayBounds } from "@/lib/group-buys/time";

const now = new Date("2026-09-14T16:30:00.000Z");
const recentOrders = Array.from({ length: 5 }, (_, index) => ({
  publicCode: `ord-${index}`,
  status: "PLACED" as const,
  customerName: `顧客 ${index}`,
  totalAmount: 100 + index,
  createdAt: new Date(now.getTime() - index * 60_000),
  paidAt: null,
  pickedUpAt: null,
  groupBuy: { title: "秋季團購" },
}));

beforeEach(() => {
  vi.resetAllMocks();
  boundary.groupBuyCount.mockResolvedValue(2);
  boundary.orderCount
    .mockResolvedValueOnce(3)
    .mockResolvedValueOnce(4)
    .mockResolvedValueOnce(5);
  boundary.orderFindMany.mockResolvedValue(recentOrders);
});

test("Taipei calendar-day boundaries do not depend on the server timezone", () => {
  const bounds = getTaipeiCalendarDayBounds(now);

  expect(bounds.start.toISOString()).toBe("2026-09-14T16:00:00.000Z");
  expect(bounds.end.toISOString()).toBe("2026-09-15T16:00:00.000Z");
});

test("dashboard uses explicit active, PLACED-only pending, and Taipei-today counts", async () => {
  await expect(getAdminDashboard(now)).resolves.toEqual({
    ok: true,
    value: {
      activeGroupBuyCount: 2,
      unpaidOrderCount: 3,
      awaitingPickupCount: 4,
      todayOrderCount: 5,
      recentOrders,
    },
  });

  expect(boundary.groupBuyCount).toHaveBeenCalledExactlyOnceWith({
    where: {
      status: "PUBLISHED",
      startAt: { lte: now },
      endAt: { gt: now },
    },
  });
  expect(boundary.orderCount).toHaveBeenNthCalledWith(1, {
    where: { status: "PLACED", paidAt: null },
  });
  expect(boundary.orderCount).toHaveBeenNthCalledWith(2, {
    where: { status: "PLACED", pickedUpAt: null },
  });
  expect(boundary.orderCount).toHaveBeenNthCalledWith(3, {
    where: {
      createdAt: {
        gte: new Date("2026-09-14T16:00:00.000Z"),
        lt: new Date("2026-09-15T16:00:00.000Z"),
      },
    },
  });
});

test("recent orders use a safe projection, a five-row limit, and stable ordering", async () => {
  await getAdminDashboard(now);

  expect(boundary.orderFindMany).toHaveBeenCalledExactlyOnceWith({
    select: adminDashboardRecentOrderSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 5,
  });
  expect(JSON.stringify(adminDashboardRecentOrderSelect)).not.toMatch(
    /accessToken|accessTokenHash|cost|supplier|customerPhone/,
  );
});

test("dashboard database failures are sanitized", async () => {
  boundary.groupBuyCount.mockRejectedValue(new Error("private database error"));

  await expect(getAdminDashboard(now)).resolves.toEqual({ ok: false, error: "FAILED" });
});
