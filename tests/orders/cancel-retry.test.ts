// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { Prisma } from "@/generated/prisma/client";
import { CancelOrderError } from "@/lib/orders/cancel-errors";
import {
  CancellationClaimLostError,
  MAX_CANCELLATION_CONCURRENCY_RETRIES,
  retryCancellationTransaction,
} from "@/lib/orders/cancel-retry";

function knownConflict(): unknown {
  return new Prisma.PrismaClientKnownRequestError("conflict", {
    code: "P2034",
    clientVersion: "7.10.0",
  });
}

test.each([
  ["P2034", knownConflict()],
  ["40001", { cause: { kind: "TransactionWriteConflict", originalCode: "40001" } }],
  ["40P01", { meta: { driverAdapterError: { cause: { kind: "TransactionWriteConflict", originalCode: "40P01" } } } }],
  ["claim lost", new CancellationClaimLostError()],
])("retries the complete transaction for %s", async (_label, conflict) => {
  const runAttempt = vi.fn()
    .mockRejectedValueOnce(conflict)
    .mockResolvedValueOnce("cancelled");
  const sleep = vi.fn(async () => undefined);
  await expect(retryCancellationTransaction(runAttempt, {
    random: () => 0.5,
    sleep,
  })).resolves.toBe("cancelled");
  expect(runAttempt).toHaveBeenCalledTimes(2);
  expect(runAttempt.mock.calls.map(([attempt]) => attempt)).toEqual([1, 2]);
  expect(sleep).toHaveBeenCalledExactlyOnceWith(12);
});

test.each(["ACCESS_DENIED", "CANCELLATION_CLOSED"] as const)(
  "%s domain failure is not retried",
  async (code) => {
    const failure = new CancelOrderError(code);
    const runAttempt = vi.fn().mockRejectedValue(failure);
    await expect(retryCancellationTransaction(runAttempt)).rejects.toBe(failure);
    expect(runAttempt).toHaveBeenCalledTimes(1);
  },
);

test("unexpected failure is sanitized without retry", async () => {
  const raw = new Error("private SQL");
  const runAttempt = vi.fn().mockRejectedValue(raw);
  const result = await retryCancellationTransaction(runAttempt).catch((error: unknown) => error);
  expect(result).toMatchObject({ code: "FAILED", message: "The cancellation failed." });
  expect(result).not.toBe(raw);
  expect(runAttempt).toHaveBeenCalledTimes(1);
});

test("bounds whole-transaction conflict retries", async () => {
  const runAttempt = vi.fn().mockRejectedValue(knownConflict());
  await expect(retryCancellationTransaction(runAttempt, {
    random: () => 0,
    sleep: async () => undefined,
  })).rejects.toMatchObject({ code: "CONFLICT_RETRY_EXHAUSTED" });
  expect(runAttempt).toHaveBeenCalledTimes(1 + MAX_CANCELLATION_CONCURRENCY_RETRIES);
});
