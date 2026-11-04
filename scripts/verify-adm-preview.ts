import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateE2eTargetDatabaseUrl } from "./lib/e2e-database";
validateE2eTargetDatabaseUrl(process.env.DATABASE_URL ?? "");
if (process.env.QBUY_ENV !== "test" || process.env.QBUY_ENABLE_LINE_PUSH !== "false" || process.env.QBUY_ENABLE_LOGISTICS_EXTERNAL !== "false") throw new Error("外部服務必須停用。");
const manifest = JSON.parse(await readFile(".temp/adm-preview/manifest.json", "utf8")) as { database: string; complete: boolean; scenarios: { index: number; checkoutId: string }[] };
assert.equal(new URL(process.env.DATABASE_URL!).pathname, `/${manifest.database}`); assert.equal(manifest.complete, true);
const { getDb } = await import("../src/lib/db");
const { listOrders, listPurchases, parseOrderFilters, pendingDeliveryWork, purchaseQueueFilter } = await import("../src/lib/admin/orders");
const { getAdminWorkspace } = await import("../src/lib/admin/workspace");
const db = getDb();
try {
  const rows = await db.checkout.findMany({ include: { items: true, orders: true, fulfillmentGroups: true, cancellations: true, refunds: true, qbShipments: true, payment: true, returns: true } });
  assert.equal(rows.length, 30); assert.equal(await db.qbOrder.count(), 23); assert.equal(await db.fulfillmentGroup.count(), 31); assert.equal(await db.order.count(), 0);
  for (const scenario of manifest.scenarios) {
    const row = rows.find(r => r.id === scenario.checkoutId)!; assert.ok(row);
    const i = scenario.index;
    assert.equal(row.status, i < 2 ? "AWAITING_PAYMENT" : i < 4 ? "REPORTED" : i < 6 ? "ANOMALY" : i < 8 ? "RECEIVED" : "FINALIZED");
    assert.equal(row.orders.length, i < 8 ? 0 : i === 9 ? 2 : 1);
    assert.equal(row.fulfillmentGroups.length, i === 10 ? 2 : 1);
    if (i === 18) assert.equal(row.cancellations[0].status, "PENDING");
    if (i === 20) assert.equal(row.cancellations[0].status, "REJECTED");
    if ([19, 21, 22, 23].includes(i)) assert.equal(row.orders[0].status, "CANCELLED");
    if ([19, 21, 22, 23].includes(i)) assert.equal(row.refunds[0].status, ({ 19: "PENDING", 21: "PROCESSING", 22: "REFUNDED", 23: "ERROR" })[i as 19 | 21 | 22 | 23]);
    if (i === 29) { assert.equal(row.qbShipments.length, 2); assert.equal(row.returns[0].status, "RESENT"); assert.ok(row.qbShipments.some(s => s.previousShipmentId)); }
  }
  const first = await listPurchases(parseOrderFilters({})); const second = await listPurchases(parseOrderFilters({ page: "2" }));
  assert.equal(first.count, 30); assert.equal(first.rows.length, 20); assert.equal(second.rows.length, 10); assert.ok(!first.rows.some(r => second.rows.some(s => r.id === s.id)));
  assert.equal((await listOrders(parseOrderFilters({ view: "orders" }))).count, 23);
  assert.equal((await listPurchases(parseOrderFilters({ q: "ZZZ沒有這筆訂單" }))).count, 0);
  const summary = await getAdminWorkspace();
  const {getTaipeiCalendarDayBounds}=await import("../src/lib/group-buys/time");
  const {start,end}=getTaipeiCalendarDayBounds(new Date());
  assert.equal(summary.todayPurchases,rows.filter(r=>r.createdAt>=start&&r.createdAt<end).length);
  assert.equal(summary.todayOrders,rows.flatMap(r=>r.orders).filter(o=>o.createdAt>=start&&o.createdAt<end).length);
  for (const queue of ["cancel", "refund", "refundError", "shippingError"]) {
    const count = await db.checkout.count({ where: await purchaseQueueFilter(queue) });
    assert.equal(summary.tasks.find(t => t.key === queue)!.count, count);
    assert.equal((await listPurchases(parseOrderFilters({ queue }))).count, count);
  }
  const expectedGroups = rows.flatMap(c => c.fulfillmentGroups.filter(g => c.status === "FINALIZED" && c.items.some(i => i.fulfillmentGroupId === g.id && c.orders.some(o => o.groupBuyId === i.groupBuyId && o.status === "PAID")) && !c.qbShipments.some(s => s.fulfillmentGroupId === g.id && !["VOIDED", "RETURNED"].includes(s.status))));
  const pending = await pendingDeliveryWork(); assert.equal(summary.shipmentGroups, expectedGroups.length); assert.equal(pending.reduce((n, r) => n + r.groups, 0), expectedGroups.length);
  assert.equal((await listPurchases(parseOrderFilters({ queue: "shipment" }))).count, new Set(expectedGroups.map(g => g.checkoutId)).size);
  assert.equal(await db.checkoutOutbox.count({ where: { deliveredAt: { not: null } } }), 0); assert.equal(await db.notificationDelivery.count(), 0);
  for (const sku of await db.productSku.findMany({ include: { inventory: true } })) {
    const movements = await db.inventoryMovement.findMany({ where: { skuId: sku.id }, orderBy: { createdAt: "asc" } });
    assert.equal(movements[0].kind, "INITIAL"); assert.equal(sku.inventory!.onHand, movements.at(-1)!.afterOnHand);
    assert.ok(sku.inventory!.reserved + sku.inventory!.allocated <= sku.inventory!.onHand);
  }
  console.log("PASS：30 種情境、QB／配送關聯、狀態機結果、搜尋分頁、工作佇列數量、庫存帳與外部服務停用檢查。");
} finally { await db.$disconnect(); }
