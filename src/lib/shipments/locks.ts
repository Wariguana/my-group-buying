import "server-only";

import { Prisma } from "@/generated/prisma/client";

type TransactionClient = Prisma.TransactionClient;

export async function lockOrderByPublicCode(tx: TransactionClient, publicCode: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "publicCode" = ${publicCode} FOR UPDATE
  `);
  return rows.length === 1;
}

export async function lockAuthorizedOrderByPublicCode(
  tx: TransactionClient,
  publicCode: string,
  tokenHash: string | null,
  customerAccountId: string | null,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Order"
    WHERE "publicCode" = ${publicCode}
      AND ((${tokenHash}::text IS NOT NULL AND "accessTokenHash" = ${tokenHash})
        OR (${customerAccountId}::uuid IS NOT NULL AND "customerAccountId" = ${customerAccountId}::uuid))
    FOR UPDATE
  `);
  return rows.length === 1;
}

export async function lockOrderForShipment(tx: TransactionClient, shipmentId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT o."id" FROM "Order" o JOIN "Shipment" s ON s."orderId" = o."id"
    WHERE s."id" = ${shipmentId}::uuid FOR UPDATE OF o
  `);
  return rows.length === 1;
}

export async function lockShipment(tx: TransactionClient, shipmentId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Shipment" WHERE "id" = ${shipmentId}::uuid FOR UPDATE
  `);
  return rows.length === 1;
}
