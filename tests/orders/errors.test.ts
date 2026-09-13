// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { Prisma } from "@/generated/prisma/client";
import {
  isCustomerPhoneUniqueConflict,
  isOrderPublicCodeUniqueConflict,
  isTransactionConflict,
  OrderDomainError,
} from "@/lib/orders/errors";

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

function nestedUnique(modelName: string, index: string): unknown {
  return knownError("P2002", {
    modelName,
    driverAdapterError: {
      cause: adapterCause("UniqueConstraintViolation", "23505", index),
    },
  });
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

test("classifies only the precise Customer phone unique violation", () => {
  const error = nestedUnique("Customer", "Customer_phone_key");
  expect(isCustomerPhoneUniqueConflict(error)).toBe(true);
  expect(isOrderPublicCodeUniqueConflict(error)).toBe(false);
});

test("classifies only the precise Order publicCode unique violation", () => {
  const error = nestedUnique("Order", "Order_publicCode_key");
  expect(isOrderPublicCodeUniqueConflict(error)).toBe(true);
  expect(isCustomerPhoneUniqueConflict(error)).toBe(false);
});

test.each([
  knownError("P2002"),
  nestedUnique("Customer", "Order_publicCode_key"),
  nestedUnique("Order", "Customer_phone_key"),
  { code: "P2002", meta: { modelName: "Customer" } },
])("rejects unrelated or incomplete P2002 %#", (error) => {
  expect(isCustomerPhoneUniqueConflict(error)).toBe(false);
  expect(isOrderPublicCodeUniqueConflict(error)).toBe(false);
});

test.each([null, undefined, true, 42, "P2034", Symbol("error")])(
  "all classifiers reject primitive error %j",
  (error) => {
    expect(isTransactionConflict(error)).toBe(false);
    expect(isCustomerPhoneUniqueConflict(error)).toBe(false);
    expect(isOrderPublicCodeUniqueConflict(error)).toBe(false);
  },
);

test("domain errors expose only a fixed public-safe code and message", () => {
  const error = new OrderDomainError("FAILED");
  expect(error).toMatchObject({ name: "OrderDomainError", code: "FAILED", message: "The order operation failed." });
  expect(error.message).not.toMatch(/P\d{4}|SQLSTATE|constraint|query/i);
  expect(error).not.toHaveProperty("cause");
});
