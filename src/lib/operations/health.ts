import "server-only";
import { getDb } from "@/lib/db";
import { featureEnabled } from "./config";
export async function operationalHealth() {
  const db = getDb();
  const now = new Date(), day = new Date(now.getTime() - 86400000);
  const [heartbeats, expired, reported, anomalies, unfinalized, refunds, cancellations, shipmentPendingRows, shippingErrorRows, returns, notifications, inventory] = await Promise.all([
    db.workerHeartbeat.findMany(),
    db.checkout.count({ where: { status: "AWAITING_PAYMENT", expiresAt: { lt: new Date(now.getTime() - 120000) } } }),
    db.payment.count({ where: { status: "REPORTED", reportedAt: { lt: day } } }),
    db.checkout.count({ where: { status: "ANOMALY", createdAt: { lt: day } } }),
    db.checkout.count({ where: { status: "RECEIVED", payment: { confirmedAt: { lt: new Date(now.getTime() - 900000) } } } }),
    db.refundObligation.count({ where: { status: { in: ["PENDING", "PROCESSING", "ERROR"] }, createdAt: { lt: day } } }),
    db.cancellationRequest.count({ where: { status: { in: ["PENDING", "REVIEW_REQUIRED"] }, submittedAt: { lt: day } } }),
    db.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM "FulfillmentGroup" g
      JOIN "Checkout" c ON c.id = g."checkoutId"
      WHERE c.status = 'FINALIZED' AND g."waitUntil" < ${day}
      AND EXISTS (SELECT 1 FROM "CheckoutItem" i JOIN "QbOrder" o
        ON o."checkoutId" = i."checkoutId" AND o."groupBuyId" = i."groupBuyId"
        WHERE i."fulfillmentGroupId" = g.id AND o.status = 'PAID')
      AND NOT EXISTS (SELECT 1 FROM "QbShipment" s WHERE s."fulfillmentGroupId" = g.id AND s.status NOT IN ('VOIDED', 'RETURNED'))`,
    db.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM "QbShipment" s
      WHERE s.status IN ('VOIDED', 'RETURNED')
      AND EXISTS (SELECT 1 FROM "CheckoutItem" i JOIN "QbOrder" o
        ON o."checkoutId" = i."checkoutId" AND o."groupBuyId" = i."groupBuyId"
        WHERE i."fulfillmentGroupId" = s."fulfillmentGroupId" AND o.status = 'PAID')
      AND NOT EXISTS (SELECT 1 FROM "QbShipment" replacement
        WHERE replacement."fulfillmentGroupId" = s."fulfillmentGroupId" AND replacement.status NOT IN ('VOIDED', 'RETURNED'))`,
    db.qbReturnCase.count({ where: { status: { not: "RESENT" }, deadline: { lt: now } } }),
    db.checkoutOutbox.count({ where: { audience: { not: "LEGACY" }, OR: [{ status: { in: ["FAILED", "BLOCKED"] } }, { status: { in: ["PENDING", "RETRY", "SENDING"] }, createdAt: { lt: new Date(now.getTime() - 900000) } }] } }),
    db.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM "SkuInventory" WHERE "onHand" < "reserved" + "allocated" OR "reserved" < 0 OR "allocated" < 0 OR "onHand" < 0`,
  ]);
  const workers = ["checkouts", "notifications"].map(name => {
    const h = heartbeats.find(h => h.name === name);
    return { name, lastSuccessAt: h?.lastSuccessAt ?? null, lastError: h?.lastError ?? null, healthy: !!h?.lastSuccessAt && now.getTime() - h.lastSuccessAt.getTime() < 180000 && !h.lastError };
  });
  const shipmentPending = Number(shipmentPendingRows[0].count), shippingErrors = Number(shippingErrorRows[0].count);
  const queues = { expired, reported, anomalies, unfinalized, refunds, cancellations, shipmentPending, shippingErrors, returns, notifications, inventory: Number(inventory[0].count) };
  return { at: now, workers, queues, linePushEnabled: featureEnabled("LINE_PUSH"), healthy: workers.every(w => w.healthy) && expired === 0 && unfinalized === 0 && Number(inventory[0].count) === 0 };
}
