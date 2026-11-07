// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
const db = vi.hoisted(() => ({ raw: vi.fn(), purchases: vi.fn(), orders: vi.fn(), count: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => ({ $queryRaw: db.raw,
  checkout: { findMany: db.purchases, count: db.count }, qbOrder: { findMany: db.orders, count: db.count } }) }));
import { listOrders, listPurchases, parseOrderFilters, pendingDeliveryWork, purchaseQueueFilter } from "@/lib/admin/orders";
beforeEach(() => { vi.resetAllMocks(); db.orders.mockResolvedValue([]); db.purchases.mockResolvedValue([]); });
const sql = (index: number) => db.raw.mock.calls[index][0] as Prisma.Sql;

test("order search counts in SQL and retrieves only a stable page of IDs", async () => {
  db.raw.mockResolvedValueOnce([{ count: 45 }]).mockResolvedValueOnce([{ id: "last-page" }]);
  const result = await listOrders(parseOrderFilters({ view: "orders", q: "a' OR true --", status: "PAID", today: "1", page: "99" }));
  expect(result).toMatchObject({ count: 45, page: 3 });
  expect(sql(0).text).toContain('count(*)::int');
  expect(sql(0).text).toContain('i."checkoutId" = o."checkoutId"');
  expect(sql(0).text).toContain('i."groupBuyId" = o."groupBuyId"');
  expect(sql(0).text).toContain('c."customerPhone" LIKE');
  expect(sql(0).text).not.toContain('c."customerPhone" ILIKE');
  expect(sql(0).text).not.toContain("a' OR true --");
  expect(sql(0).values).toContain("%a' OR true --%");
  expect(sql(1).text).toContain('ORDER BY o."createdAt" DESC, o.id DESC LIMIT 20 OFFSET');
  expect(sql(1).values.at(-1)).toBe(40);
  expect(db.orders).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["last-page"] } }, take: 20 }));
  expect(db.orders.mock.calls[0][0].skip).toBe(0);
});

test("shipment pagination preserves correlated paid groups, date and search without loading all IDs", async () => {
  db.raw.mockResolvedValueOnce([{ count: 22 }]).mockResolvedValueOnce([{ id: "purchase" }]);
  const result = await listPurchases(parseOrderFilters({ queue: "shipment", q: "Buyer", today: "1", status: "FINALIZED", page: "2" }));
  expect(result).toMatchObject({ count: 22, page: 2 });
  expect(sql(0).text).toContain('o."checkoutId" = i."checkoutId" AND o."groupBuyId" = i."groupBuyId"');
  expect(sql(0).text).toContain("o.status = 'PAID'");
  expect(sql(0).text).toContain("NOT IN ('VOIDED','RETURNED')");
  expect(sql(0).text).toContain('c."createdAt" >=');
  expect(sql(0).values).toContain("%Buyer%");
  expect(sql(1).values.at(-1)).toBe(20);
  expect(db.count).not.toHaveBeenCalled();
  expect(db.purchases).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["purchase"] } }, skip: 0, take: 20 }));
});

test("empty last-page requests clamp to page one", async () => {
  db.raw.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([]);
  expect(await listOrders(parseOrderFilters({ view: "orders", q: "missing", page: "100" }))).toMatchObject({ count: 0, page: 1 });
  expect(sql(1).values.at(-1)).toBe(0);
});

test("workspace aggregate returns counts rather than a row for each purchase", async () => {
  db.raw.mockResolvedValue([{ groups: 300, purchases: 200 }]);
  expect(await pendingDeliveryWork()).toEqual({ groups: 300, purchases: 200 });
  expect(sql(0).text).toContain('count(DISTINCT g."checkoutId")::int');
  expect(sql(0).text).not.toContain('GROUP BY');
});

test("shipping errors use a same-group relation anti-join without a preliminary ID query", async () => {
  expect(await purchaseQueueFilter("shippingError")).toEqual({ qbShipments: { some: {
    status: { in: ["RETURNED", "VOIDED"] }, group: { qbShipments: { none: { status: { notIn: ["RETURNED", "VOIDED"] } } } },
  } } });
  expect(db.raw).not.toHaveBeenCalled();
});

test("unsearched orders retain direct Prisma count/page queries", async () => {
  db.count.mockResolvedValue(24);
  expect(await listOrders(parseOrderFilters({ view: "orders", status: "PAID", page: "2" }))).toMatchObject({ count: 24, page: 2 });
  expect(db.raw).not.toHaveBeenCalled();
  expect(db.count).toHaveBeenCalledWith({ where: { status: "PAID" } });
  expect(db.orders).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "PAID" }, take: 20, skip: 20 }));
});
