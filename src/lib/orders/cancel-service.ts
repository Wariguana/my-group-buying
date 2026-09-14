import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  hashOrderAccessToken,
  isValidOrderAccessToken,
} from "@/lib/orders/access-token";
import { CancelOrderError, type CancelOrderErrorCode } from "@/lib/orders/cancel-errors";
import {
  CancellationClaimLostError,
  retryCancellationTransaction,
} from "@/lib/orders/cancel-retry";
import { ORDER_PUBLIC_CODE_PATTERN } from "@/lib/orders/public-code";

export type CancelOrderResult = Readonly<{
  publicCode: string;
  status: "CANCELLED";
  cancelledAt: Date;
}>;

const cancellationOrderSelect = {
  id: true,
  publicCode: true,
  status: true,
  cancelledAt: true,
  groupBuy: { select: { endAt: true } },
  items: {
    select: {
      groupBuyItemId: true,
      quantity: true,
      groupBuyItem: { select: { stock: true } },
    },
  },
} satisfies Prisma.OrderSelect;

type TransactionClient = Prisma.TransactionClient;
type CancellationOrder = Prisma.OrderGetPayload<{
  select: typeof cancellationOrderSelect;
}>;

function fail(code: CancelOrderErrorCode): never {
  throw new CancelOrderError(code);
}

function cancelledResult(
  publicCode: string,
  cancelledAt: Date | null,
): CancelOrderResult {
  if (!cancelledAt) fail("FAILED");
  return Object.freeze({ publicCode, status: "CANCELLED", cancelledAt });
}

function canonicalItemOrder(order: CancellationOrder) {
  return [...order.items].sort((left, right) => {
    const leftId = left.groupBuyItemId.toLowerCase();
    const rightId = right.groupBuyItemId.toLowerCase();
    if (leftId < rightId) return -1;
    if (leftId > rightId) return 1;
    return 0;
  });
}

async function runCancellationAttempt(
  tx: TransactionClient,
  publicCode: string,
  accessTokenHash: string,
  now: Date,
): Promise<CancelOrderResult> {
  const order = await tx.order.findFirst({
    where: { publicCode, accessTokenHash },
    select: cancellationOrderSelect,
  });
  if (!order) fail("ACCESS_DENIED");

  if (order.status === "CANCELLED") {
    return cancelledResult(order.publicCode, order.cancelledAt);
  }
  if (now >= order.groupBuy.endAt) fail("CANCELLATION_CLOSED");

  const items = canonicalItemOrder(order);
  if (items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1)) {
    fail("FAILED");
  }

  const claim = await tx.order.updateMany({
    where: {
      id: order.id,
      accessTokenHash,
      status: "PLACED",
    },
    data: { status: "CANCELLED", cancelledAt: now },
  });
  if (claim.count !== 1) throw new CancellationClaimLostError();

  for (const item of items) {
    if (item.groupBuyItem.stock === null) continue;
    const restored = await tx.groupBuyItem.updateMany({
      where: { id: item.groupBuyItemId, stock: { not: null } },
      data: { stock: { increment: item.quantity } },
    });
    if (restored.count !== 1) fail("FAILED");
  }

  return cancelledResult(order.publicCode, now);
}

export async function cancelOrder(
  publicCode: unknown,
  rawAccessToken: unknown,
): Promise<CancelOrderResult> {
  if (
    typeof publicCode !== "string"
    || !ORDER_PUBLIC_CODE_PATTERN.test(publicCode)
    || !isValidOrderAccessToken(rawAccessToken)
  ) {
    fail("ACCESS_DENIED");
  }

  let accessTokenHash: string;
  try {
    accessTokenHash = hashOrderAccessToken(rawAccessToken);
  } catch {
    fail("FAILED");
  }
  return retryCancellationTransaction(() => {
    const now = new Date();
    return getDb().$transaction(
      (tx) => runCancellationAttempt(tx, publicCode, accessTokenHash, now),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  });
}
