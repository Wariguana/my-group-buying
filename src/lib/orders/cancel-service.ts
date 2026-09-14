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
  pickedUpAt: true,
  paidAt: true,
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
  order: CancellationOrder,
  claimScope: Prisma.OrderWhereInput,
  now: Date,
): Promise<CancelOrderResult> {
  if (order.status === "CANCELLED") {
    if (order.pickedUpAt !== null || order.paidAt !== null) fail("FAILED");
    return cancelledResult(order.publicCode, order.cancelledAt);
  }
  if (order.pickedUpAt !== null) fail("ALREADY_PICKED_UP");
  if (order.paidAt !== null) fail("ALREADY_PAID");

  const items = canonicalItemOrder(order);
  if (items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1)) {
    fail("FAILED");
  }

  const claim = await tx.order.updateMany({
    where: {
      ...claimScope,
      id: order.id,
      status: "PLACED",
      pickedUpAt: null,
      paidAt: null,
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

// Only server-owned entry points supply the reader and claim scope. Each retry
// re-reads authorization/policy and state inside the complete transaction.
function cancellationTransaction(
  readOrder: (tx: TransactionClient, now: Date) => Promise<{
    order: CancellationOrder;
    claimScope: Prisma.OrderWhereInput;
  }>,
): Promise<CancelOrderResult> {
  return retryCancellationTransaction(() => {
    const now = new Date();
    return getDb().$transaction(
      async (tx) => {
        const { order, claimScope } = await readOrder(tx, now);
        return runCancellationAttempt(tx, order, claimScope, now);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  });
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
  return cancellationTransaction(async (tx, now) => {
    const order = await tx.order.findFirst({
      where: { publicCode, accessTokenHash },
      select: { ...cancellationOrderSelect, groupBuy: { select: { endAt: true } } },
    });
    // Authorization precedes idempotency, including for already-cancelled orders.
    if (!order) fail("ACCESS_DENIED");
    if (order.status === "PLACED" && order.pickedUpAt !== null) {
      fail("ALREADY_PICKED_UP");
    }
    if (order.status === "PLACED" && order.paidAt !== null) {
      fail("ALREADY_PAID");
    }
    if (order.status === "PLACED" && now >= order.groupBuy.endAt) {
      fail("CANCELLATION_CLOSED");
    }
    return { order, claimScope: { accessTokenHash } };
  });
}

/** Server-only Admin entry. Every calling Server Action must first requireAdmin(). */
export async function cancelOrderAsAdmin(publicCode: unknown): Promise<CancelOrderResult> {
  if (typeof publicCode !== "string" || !ORDER_PUBLIC_CODE_PATTERN.test(publicCode)) {
    fail("ACCESS_DENIED");
  }
  return cancellationTransaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { publicCode },
      select: cancellationOrderSelect,
    });
    if (!order) fail("ACCESS_DENIED");
    return { order, claimScope: {} };
  });
}
