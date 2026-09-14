import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { PickupOrderError } from "@/lib/orders/pickup-errors";
import { PickupClaimLostError, retryPickupTransaction } from "@/lib/orders/pickup-retry";
import { ORDER_PUBLIC_CODE_PATTERN } from "@/lib/orders/public-code";

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
      const order = await tx.order.findUnique({
        where: { publicCode },
        select: { id: true, publicCode: true, status: true, pickedUpAt: true, paidAt: true, cancelledAt: true },
      });
      if (!order) throw new PickupOrderError("ACCESS_DENIED");
      if (order.status === "CANCELLED") {
        throw new PickupOrderError(
          order.pickedUpAt === null && order.paidAt === null && order.cancelledAt !== null
            ? "CANCELLED" : "FAILED",
        );
      }
      if (order.pickedUpAt !== null) {
        return Object.freeze({ publicCode: order.publicCode, pickedUpAt: order.pickedUpAt });
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
