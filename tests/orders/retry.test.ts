// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { Prisma } from "@/generated/prisma/client";
import { OrderDomainError } from "@/lib/orders/errors";
import {
  MAX_CONCURRENCY_RETRIES,
  MAX_PUBLIC_CODE_COLLISIONS,
  MAX_TRANSACTION_ATTEMPTS,
  retryOrderTransaction,
} from "@/lib/orders/retry";

function knownError(code: string, meta?: Record<string, unknown>): unknown {
  return new Prisma.PrismaClientKnownRequestError("must not be parsed", {
    code,
    clientVersion: "7.10.0",
    meta,
  });
}

const transactionConflict = knownError("P2034");
const customerConflict = knownError("P2002", {
    modelName: "Customer",
    driverAdapterError: {
      cause: {
        kind: "UniqueConstraintViolation",
        originalCode: "23505",
        constraint: { index: "Customer_phone_key" },
      },
    },
  });
const publicCodeConflict = knownError("P2002", {
    modelName: "Order",
    driverAdapterError: {
      cause: {
        kind: "UniqueConstraintViolation",
        originalCode: "23505",
        constraint: { index: "Order_publicCode_key" },
      },
    },
  });

test.each([
  ["transaction conflict", transactionConflict],
  ["Customer first-create conflict", customerConflict],
] as const)("retries a %s with injectable backoff", async (_label, conflict) => {
  const runAttempt = vi.fn()
    .mockRejectedValueOnce(conflict)
    .mockResolvedValueOnce("committed");
  const sleep = vi.fn(async () => undefined);

  await expect(retryOrderTransaction(runAttempt, {
    generatePublicCode: () => "ord-fixed",
    random: () => 0.5,
    sleep,
  })).resolves.toBe("committed");
  expect(runAttempt).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledExactlyOnceWith(12);
});

test("retries publicCode collision with a fresh candidate and no backoff", async () => {
  const generatePublicCode = vi.fn()
    .mockReturnValueOnce("ord-forcedCollision")
    .mockReturnValueOnce("ord-freshCode");
  const runAttempt = vi.fn()
    .mockRejectedValueOnce(publicCodeConflict)
    .mockResolvedValueOnce("committed");
  const sleep = vi.fn(async () => undefined);

  await expect(retryOrderTransaction(runAttempt, { generatePublicCode, sleep }))
    .resolves.toBe("committed");
  expect(generatePublicCode).toHaveBeenCalledTimes(2);
  expect(runAttempt.mock.calls.map(([context]) => context.publicCode)).toEqual([
    "ord-forcedCollision",
    "ord-freshCode",
  ]);
  expect(sleep).not.toHaveBeenCalled();
});

test("sanitizes an initial publicCode generator failure before running a transaction", async () => {
  const rawError = new Error("raw initial generator failure");
  const generatePublicCode = vi.fn(() => {
    throw rawError;
  });
  const runAttempt = vi.fn();

  const outcome = await retryOrderTransaction(runAttempt, { generatePublicCode })
    .catch((error: unknown) => error);

  expect(outcome).toMatchObject({ code: "FAILED", message: "The order operation failed." });
  expect(outcome).not.toBe(rawError);
  expect(runAttempt).not.toHaveBeenCalled();
});

test("sanitizes a replacement publicCode generator failure after a collision", async () => {
  const rawError = new Error("raw replacement generator failure");
  const generatePublicCode = vi.fn()
    .mockReturnValueOnce("ord-forcedCollision")
    .mockImplementationOnce(() => {
      throw rawError;
    });
  const runAttempt = vi.fn().mockRejectedValueOnce(publicCodeConflict);

  const outcome = await retryOrderTransaction(runAttempt, { generatePublicCode })
    .catch((error: unknown) => error);

  expect(outcome).toMatchObject({ code: "FAILED", message: "The order operation failed." });
  expect(outcome).not.toBe(rawError);
  expect(runAttempt).toHaveBeenCalledTimes(1);
  expect(generatePublicCode).toHaveBeenCalledTimes(2);
});

test("sanitizes a sleep rejection after a transaction conflict", async () => {
  const rawError = new Error("raw sleep failure");
  const runAttempt = vi.fn().mockRejectedValueOnce(transactionConflict);
  const sleep = vi.fn().mockRejectedValue(rawError);

  const outcome = await retryOrderTransaction(runAttempt, {
    generatePublicCode: () => "ord-fixed",
    random: () => 0,
    sleep,
  }).catch((error: unknown) => error);

  expect(outcome).toMatchObject({ code: "FAILED", message: "The order operation failed." });
  expect(outcome).not.toBe(rawError);
  expect(runAttempt).toHaveBeenCalledTimes(1);
  expect(sleep).toHaveBeenCalledTimes(1);
});

test("sanitizes a random dependency failure after a transaction conflict", async () => {
  const rawError = new Error("raw random failure");
  const runAttempt = vi.fn().mockRejectedValueOnce(transactionConflict);
  const random = vi.fn(() => {
    throw rawError;
  });
  const sleep = vi.fn(async () => undefined);

  const outcome = await retryOrderTransaction(runAttempt, {
    generatePublicCode: () => "ord-fixed",
    random,
    sleep,
  }).catch((error: unknown) => error);

  expect(outcome).toMatchObject({ code: "FAILED", message: "The order operation failed." });
  expect(outcome).not.toBe(rawError);
  expect(runAttempt).toHaveBeenCalledTimes(1);
  expect(random).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
});

test("does not retry or replace a business domain error", async () => {
  const businessError = new OrderDomainError("INSUFFICIENT_STOCK");
  const runAttempt = vi.fn().mockRejectedValue(businessError);
  await expect(retryOrderTransaction(runAttempt)).rejects.toBe(businessError);
  expect(runAttempt).toHaveBeenCalledTimes(1);
});

test("does not retry an unknown infrastructure error and sanitizes it", async () => {
  const runAttempt = vi.fn().mockRejectedValue(new Error("SQL and query args"));
  await expect(retryOrderTransaction(runAttempt)).rejects.toEqual(
    expect.objectContaining({ code: "FAILED", message: "The order operation failed." }),
  );
  expect(runAttempt).toHaveBeenCalledTimes(1);
});

test("bounds concurrency retries", async () => {
  const runAttempt = vi.fn().mockRejectedValue(transactionConflict);
  const sleep = vi.fn(async () => undefined);
  await expect(retryOrderTransaction(runAttempt, { sleep, random: () => 0 }))
    .rejects.toMatchObject({ code: "CONFLICT_RETRY_EXHAUSTED" });
  expect(runAttempt).toHaveBeenCalledTimes(1 + MAX_CONCURRENCY_RETRIES);
  expect(sleep).toHaveBeenCalledTimes(MAX_CONCURRENCY_RETRIES);
});

test("bounds publicCode collision retries and candidate generation", async () => {
  const runAttempt = vi.fn().mockRejectedValue(publicCodeConflict);
  const generatePublicCode = vi.fn(() => "ord-candidate");
  await expect(retryOrderTransaction(runAttempt, { generatePublicCode }))
    .rejects.toMatchObject({ code: "CONFLICT_RETRY_EXHAUSTED" });
  expect(runAttempt).toHaveBeenCalledTimes(1 + MAX_PUBLIC_CODE_COLLISIONS);
  expect(generatePublicCode).toHaveBeenCalledTimes(1 + MAX_PUBLIC_CODE_COLLISIONS);
});

test("keeps retry budgets independent while enforcing one total attempt bound", async () => {
  const failures = [
    publicCodeConflict,
    transactionConflict,
    publicCodeConflict,
    customerConflict,
  ];
  const runAttempt = vi.fn(async () => {
    const failure = failures.shift();
    if (failure) throw failure;
    return "committed";
  });
  await expect(retryOrderTransaction(runAttempt, {
    sleep: async () => undefined,
    random: () => 0,
  })).resolves.toBe("committed");
  expect(runAttempt).toHaveBeenCalledTimes(MAX_TRANSACTION_ATTEMPTS);
});
