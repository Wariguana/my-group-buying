// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { Prisma } from "@/generated/prisma/client";
import {
  isTransactionConflict,
} from "@/lib/db/transaction-conflict";

function knownError(code: string, meta?: Record<string, unknown>): unknown {
  return new Prisma.PrismaClientKnownRequestError("must not be parsed", {
    code,
    clientVersion: "7.10.0",
    meta,
  });
}

function adapterCause(kind: string, originalCode: string, index?: string) {
  return {
    kind,
    originalCode,
    ...(index === undefined ? {} : { constraint: { index } }),
  };
}

test("classifies Prisma P2034 as a transaction conflict", () => {
  expect(isTransactionConflict(knownError("P2034"))).toBe(true);
});

test.each(["40001", "40P01"])(
  "classifies top-level adapter transaction conflict %s",
  (originalCode) => {
    expect(isTransactionConflict({
      cause: adapterCause("TransactionWriteConflict", originalCode),
    })).toBe(true);
  },
);

test.each(["40001", "40P01"])(
  "classifies nested adapter transaction conflict %s",
  (originalCode) => {
    expect(isTransactionConflict({
      meta: {
        driverAdapterError: {
          cause: adapterCause("TransactionWriteConflict", originalCode),
        },
      },
    })).toBe(true);
  },
);

test.each([
  { cause: adapterCause("TransactionWriteConflict", "23505") },
  { cause: adapterCause("UniqueConstraintViolation", "40001") },
  { cause: { kind: "TransactionWriteConflict" } },
  { meta: { driverAdapterError: {} } },
  { code: "P2034" },
  { message: "TransactionWriteConflict 40001" },
])("rejects unrelated or partial adapter error %#", (error) => {
  expect(isTransactionConflict(error)).toBe(false);
});
