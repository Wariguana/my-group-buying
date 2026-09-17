import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { formatOrderNumber, formatTaipeiOrderDate } from "@/lib/orders/order-number";

type TransactionClient = Prisma.TransactionClient;

export async function allocateOrderNumber(
  tx: TransactionClient,
  createdAt: Date,
): Promise<string | null> {
  const dateKey = formatTaipeiOrderDate(createdAt);
  const rows = await tx.$queryRaw<readonly { lastValue: number }[]>(Prisma.sql`
    INSERT INTO "OrderNumberSequence" ("dateKey", "lastValue")
    VALUES (${dateKey}, 1)
    ON CONFLICT ("dateKey") DO UPDATE
      SET "lastValue" = "OrderNumberSequence"."lastValue" + 1
      WHERE "OrderNumberSequence"."lastValue" < 9999
    RETURNING "lastValue"
  `);
  const nextValue = rows[0]?.lastValue;
  return nextValue === undefined ? null : formatOrderNumber(dateKey, nextValue);
}
