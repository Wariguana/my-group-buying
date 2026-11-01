// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  groupBuyCount: vi.fn(),
  raw: vi.fn(),
  checkoutCount: vi.fn(),
  qbOrderCount: vi.fn(),
  qbOrderFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    $queryRaw: boundary.raw,
    groupBuy: { count: boundary.groupBuyCount },
    checkout: { count: boundary.checkoutCount },
    qbOrder: { count: boundary.qbOrderCount, findMany: boundary.qbOrderFindMany },
  }),
}));
import { getAdminWorkspace } from "@/lib/admin/workspace";

const now = new Date("2026-11-01T02:00:00.000Z");
beforeEach(() => {
  vi.resetAllMocks();
  boundary.groupBuyCount.mockResolvedValue(2);
  boundary.raw.mockResolvedValueOnce([{checkoutId:"error"}]).mockResolvedValueOnce([{checkoutId:"one",groups:2},{checkoutId:"two",groups:3}]);
  // Today purchases, reported, anomalies, received, cancellation, refund, refund error, shipment, shipping error.
  [4, 3, 2, 1, 1, 2, 1, 1].forEach((count) => boundary.checkoutCount.mockResolvedValueOnce(count));
  boundary.qbOrderCount.mockResolvedValue(6);
  boundary.qbOrderFindMany.mockResolvedValue([]);
});

test("QB workspace clearly separates purchase and formal-order counts", async () => {
  const workspace = await getAdminWorkspace(now);
  expect(workspace.activeGroupBuys).toBe(2);
  expect(workspace.todayPurchases).toBe(4);
  expect(workspace.todayOrders).toBe(6);
  expect(workspace.shipmentGroups).toBe(5);
  expect(workspace.tasks.find((task) => task.key === "reported")).toMatchObject({
    count: 3, unit: "筆購買", href: "/admin/payments?status=REPORTED",
  });
  expect(workspace.tasks.find((task) => task.key === "shipment")).toMatchObject({
    count: 5, unit: "個配送群組", href: "/admin/qbuy?view=purchases&queue=shipment",
  });
  expect(boundary.qbOrderFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }));
});

test("Taipei calendar boundaries are used for both today counters", async () => {
  await getAdminWorkspace(now);
  const todayRange = {
    gte: new Date("2026-10-31T16:00:00.000Z"),
    lt: new Date("2026-11-01T16:00:00.000Z"),
  };
  expect(boundary.checkoutCount).toHaveBeenNthCalledWith(1, { where: { createdAt: todayRange } });
  expect(boundary.qbOrderCount).toHaveBeenCalledWith({ where: { createdAt: todayRange } });
});

test("delivery groups remain distinct from purchases and errors use the same queue filter", async () => {
 const result=await getAdminWorkspace(now);
 expect(result.shipmentGroups).toBe(5); expect(result.shipmentPurchases).toBe(2);
 expect(boundary.checkoutCount).toHaveBeenNthCalledWith(8,{where:{id:{in:["error"]}}});
 expect(result.tasks.find(t=>t.key==="shipment")?.description).toContain("2 筆購買");
});
