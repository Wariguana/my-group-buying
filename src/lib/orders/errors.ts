import "server-only";

import { Prisma } from "@/generated/prisma/client";

export type OrderErrorCode =
  | "INVALID_ORDER_INPUT"
  | "GROUP_BUY_NOT_ORDERABLE"
  | "ITEM_NOT_AVAILABLE"
  | "PRICE_CHANGED"
  | "PICKUP_NOT_AVAILABLE"
  | "STORE_SELECTION_INVALID"
  | "INSUFFICIENT_STOCK"
  | "PURCHASE_LIMIT_EXCEEDED"
  | "CONFLICT_RETRY_EXHAUSTED"
  | "FAILED";

const errorMessages: Record<OrderErrorCode, string> = {
  INVALID_ORDER_INPUT: "Invalid order input.",
  GROUP_BUY_NOT_ORDERABLE: "This group buy is not accepting orders.",
  ITEM_NOT_AVAILABLE: "An ordered item is not available.",
  PRICE_CHANGED: "An ordered item's price changed before submission.",
  PICKUP_NOT_AVAILABLE: "The selected pickup is not available.",
  STORE_SELECTION_INVALID: "The selected 7-ELEVEN store selection is invalid or expired.",
  INSUFFICIENT_STOCK: "An ordered item has insufficient stock.",
  PURCHASE_LIMIT_EXCEEDED: "An ordered item exceeds its purchase limit.",
  CONFLICT_RETRY_EXHAUSTED: "The order conflicted with another request. Please try again.",
  FAILED: "The order operation failed.",
};

export class OrderDomainError extends Error {
  constructor(public readonly code: OrderErrorCode) {
    super(errorMessages[code]);
    this.name = "OrderDomainError";
  }
}

type UnknownRecord = Record<PropertyKey, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null
    ? value as UnknownRecord
    : null;
}

function adapterCause(error: unknown): UnknownRecord | null {
  const record = asRecord(error);
  if (!record) return null;

  const directCause = asRecord(record.cause);
  if (directCause) return directCause;

  const meta = asRecord(record.meta);
  const driverAdapterError = asRecord(meta?.driverAdapterError);
  return asRecord(driverAdapterError?.cause);
}

function isTransactionWriteConflictCause(cause: UnknownRecord | null): boolean {
  return cause?.kind === "TransactionWriteConflict" &&
    (cause.originalCode === "40001" || cause.originalCode === "40P01");
}

export function isTransactionConflict(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  ) {
    return true;
  }
  return isTransactionWriteConflictCause(adapterCause(error));
}

function isPreciseUniqueConflict(
  error: unknown,
  modelName: "Customer" | "Order",
  index: "Customer_phone_key" | "Order_publicCode_key",
): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;

  const record = asRecord(error);
  const meta = asRecord(record?.meta);
  const cause = adapterCause(error);
  const constraint = asRecord(cause?.constraint);

  return record?.code === "P2002" &&
    meta?.modelName === modelName &&
    cause?.kind === "UniqueConstraintViolation" &&
    constraint?.index === index;
}

export function isCustomerPhoneUniqueConflict(error: unknown): boolean {
  return isPreciseUniqueConflict(error, "Customer", "Customer_phone_key");
}

export function isOrderPublicCodeUniqueConflict(error: unknown): boolean {
  return isPreciseUniqueConflict(error, "Order", "Order_publicCode_key");
}
