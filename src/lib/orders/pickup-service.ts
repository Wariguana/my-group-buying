import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { PickupOrderError } from "@/lib/orders/pickup-errors";
import { PickupClaimLostError, retryPickupTransaction } from "@/lib/orders/pickup-retry";
import { ORDER_PUBLIC_CODE_PATTERN } from "@/lib/orders/public-code";
import { lockOrderByPublicCode, lockShipment } from "@/lib/shipments/locks";

export type PickupOrderResult = Readonly<{
  publicCode: string;
  pickedUpAt: Date;
}>;

/** Server-only Admin entry. Every calling Server Action must first requireAdmin(). */
export async function markOrderPickedUpAsAdmin(publicCode: unknown): Promise<PickupOrderResult> {
  if (typeof publicCode !== "string" || !ORDER_PUBLIC_CODE_PATTERN.test(publicCode)) {
    throw new PickupOrderError("ACCESS_DENIED");
  }
  return retryPickupTransaction(() => {
    const now = new Date();
    return getDb().$transaction(async (tx) => {
      if (!await lockOrderByPublicCode(tx, publicCode)) throw new PickupOrderError("ACCESS_DENIED");
      const order = await tx.order.findUnique({
        where: { publicCode },
        select: { id: true, publicCode: true, status: true, pickedUpAt: true, paidAt: true, cancelledAt: true, shipmentRequired: true, fulfillmentMethod: true },
      });
      if (!order) throw new PickupOrderError("ACCESS_DENIED");
      if (order.status === "CANCELLED") {
        throw new PickupOrderError(
          order.pickedUpAt === null && order.paidAt === null && order.cancelledAt !== null
            ? "CANCELLED" : "FAILED",
        );
      }
      if (order.pickedUpAt !== null) {
        if (order.shipmentRequired) {
          const active = await tx.shipment.findFirst({ where: { orderId: order.id, returnedAt: null, voidedAt: null } });
          if (!active || active.shippedAt === null || active.arrivedAt === null) throw new PickupOrderError("FAILED");
        }
        return Object.freeze({ publicCode: order.publicCode, pickedUpAt: order.pickedUpAt });
      }
      if (order.shipmentRequired) {
        if (order.fulfillmentMethod !== "SEVEN_ELEVEN") throw new PickupOrderError("SHIPMENT_NOT_READY");
        const active = await tx.shipment.findFirst({ where: { orderId: order.id, returnedAt: null, voidedAt: null } });
        if (!active || !await lockShipment(tx, active.id)) throw new PickupOrderError("SHIPMENT_NOT_READY");
        const fresh = await tx.shipment.findUnique({ where: { id: active.id } });
        if (!fresh || fresh.shippedAt === null || fresh.arrivedAt === null ||
            fresh.returnedAt !== null || fresh.voidedAt !== null) throw new PickupOrderError("SHIPMENT_NOT_READY");
      }
      const claim = await tx.order.updateMany({
        where: { id: order.id, status: "PLACED", pickedUpAt: null },
        data: { pickedUpAt: now },
      });
      if (claim.count !== 1) throw new PickupClaimLostError();
      return Object.freeze({ publicCode: order.publicCode, pickedUpAt: now });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });
}
