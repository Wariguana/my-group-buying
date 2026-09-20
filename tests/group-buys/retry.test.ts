// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { Prisma } from "@/generated/prisma/client";
import {
  GROUP_BUY_RETRY_BASE_DELAY_MS,
  GROUP_BUY_RETRY_MAX_DELAY_MS,
  groupBuyRetryDelayMilliseconds,
  MAX_GROUP_BUY_TRANSACTION_ATTEMPTS,
  retryGroupBuyTransaction,
} from "@/lib/group-buys/retry";

function knownError(code: string): unknown {
  return new Prisma.PrismaClientKnownRequestError("must not be parsed", {
    code,
    clientVersion: "7.10.0",
  });
}

const transactionConflict = knownError("P2034");

test("retries a recognized conflict as a fresh complete attempt after the rejected attempt finishes", async () => {
  let attemptOpen = false;
  const events: string[] = [];
  const runAttempt = vi.fn(async () => {
    attemptOpen = true;
    events.push("attempt-start");
    try {
      if (runAttempt.mock.calls.length === 1) throw transactionConflict;
      return "committed";
    } finally {
      attemptOpen = false;
      events.push("attempt-finished");
    }
  });
  const sleep = vi.fn(async (milliseconds: number) => {
    expect(attemptOpen).toBe(false);
    events.push(`sleep-${milliseconds}`);
  });

  await expect(retryGroupBuyTransaction(runAttempt, {
    random: () => 0.5,
    sleep,
  })).resolves.toBe("committed");
  expect(runAttempt).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledExactlyOnceWith(12);
  expect(events).toEqual([
    "attempt-start",
    "attempt-finished",
    "sleep-12",
    "attempt-start",
    "attempt-finished",
  ]);
});

test("uses bounded exponential full jitter between retryable attempts", async () => {
  const runAttempt = vi.fn()
    .mockRejectedValueOnce(transactionConflict)
    .mockRejectedValueOnce(transactionConflict)
    .mockResolvedValueOnce("committed");
  const sleep = vi.fn(async () => undefined);

  await retryGroupBuyTransaction(runAttempt, { random: () => 0.5, sleep });

  expect(sleep.mock.calls).toEqual([[12], [25]]);
  expect(groupBuyRetryDelayMilliseconds(1, () => -1)).toBe(0);
  expect(groupBuyRetryDelayMilliseconds(1, () => 2)).toBe(GROUP_BUY_RETRY_BASE_DELAY_MS);
  expect(groupBuyRetryDelayMilliseconds(10, () => 2)).toBe(GROUP_BUY_RETRY_MAX_DELAY_MS);
});

test("does not retry or wait after success or a returned business result", async () => {
  const sleep = vi.fn(async () => undefined);
  const success = vi.fn().mockResolvedValue({ ok: true });
  const businessResult = vi.fn().mockResolvedValue({ ok: false, error: "NOT_EDITABLE" });

  await expect(retryGroupBuyTransaction(success, { sleep })).resolves.toEqual({ ok: true });
  await expect(retryGroupBuyTransaction(businessResult, { sleep })).resolves.toEqual({
    ok: false,
    error: "NOT_EDITABLE",
  });
  expect(success).toHaveBeenCalledTimes(1);
  expect(businessResult).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
});

test("does not retry or wait for an unrecognized error", async () => {
  const error = knownError("P2002");
  const runAttempt = vi.fn().mockRejectedValue(error);
  const sleep = vi.fn(async () => undefined);

  await expect(retryGroupBuyTransaction(runAttempt, { sleep })).rejects.toBe(error);
  expect(runAttempt).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
});

test("stops at the exact attempt budget without waiting after exhaustion", async () => {
  const runAttempt = vi.fn().mockRejectedValue(transactionConflict);
  const sleep = vi.fn(async () => undefined);

  await expect(retryGroupBuyTransaction(runAttempt, {
    random: () => 1,
    sleep,
  })).rejects.toBe(transactionConflict);
  expect(runAttempt).toHaveBeenCalledTimes(MAX_GROUP_BUY_TRANSACTION_ATTEMPTS);
  expect(sleep.mock.calls).toEqual([
    [GROUP_BUY_RETRY_BASE_DELAY_MS],
    [GROUP_BUY_RETRY_MAX_DELAY_MS],
  ]);
});

test("a failed backoff does not start another transaction attempt", async () => {
  const sleepError = new Error("timer unavailable");
  const runAttempt = vi.fn().mockRejectedValue(transactionConflict);
  const sleep = vi.fn().mockRejectedValue(sleepError);

  await expect(retryGroupBuyTransaction(runAttempt, { sleep })).rejects.toBe(sleepError);
  expect(runAttempt).toHaveBeenCalledTimes(1);
  expect(sleep).toHaveBeenCalledTimes(1);
});
