import "server-only";
import { Prisma } from "@/generated/prisma/client";

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
