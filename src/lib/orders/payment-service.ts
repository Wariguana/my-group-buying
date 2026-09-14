import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { PaymentOrderError } from "@/lib/orders/payment-errors";
import { PaymentClaimLostError, retryPaymentTransaction } from "@/lib/orders/payment-retry";
import { ORDER_PUBLIC_CODE_PATTERN } from "@/lib/orders/public-code";

export type PaymentOrderResult = Readonly<{
  publicCode: string;
  paidAt: Date;
}>;

/** Server-only Admin entry. Every calling Server Action must first requireAdmin(). */
export async function markOrderPaidAsAdmin(publicCode: unknown): Promise<PaymentOrderResult> {
  if (typeof publicCode !== "string" || !ORDER_PUBLIC_CODE_PATTERN.test(publicCode)) {
    throw new PaymentOrderError("ACCESS_DENIED");
  }
  return retryPaymentTransaction(() => {
    const now = new Date();
    return getDb().$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { publicCode },
        select: { id: true, publicCode: true, status: true, paidAt: true, pickedUpAt: true, cancelledAt: true },
      });
      if (!order) throw new PaymentOrderError("ACCESS_DENIED");
      if (order.status === "CANCELLED") {
        throw new PaymentOrderError(order.paidAt === null && order.pickedUpAt === null && order.cancelledAt !== null ? "CANCELLED" : "FAILED");
      }
      if (order.paidAt !== null) {
        return Object.freeze({ publicCode: order.publicCode, paidAt: order.paidAt });
      }
      const claim = await tx.order.updateMany({
        where: { id: order.id, status: "PLACED", paidAt: null },
        data: { paidAt: now },
      });
      if (claim.count !== 1) throw new PaymentClaimLostError();
      return Object.freeze({ publicCode: order.publicCode, paidAt: now });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });
}
