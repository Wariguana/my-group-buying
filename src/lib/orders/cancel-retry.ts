import "server-only";

import { isTransactionConflict } from "@/lib/orders/errors";
import { CancelOrderError } from "@/lib/orders/cancel-errors";

export const MAX_CANCELLATION_CONCURRENCY_RETRIES = 2;

const BASE_BACKOFF_MS = 25;
const MAX_BACKOFF_MS = 100;

export class CancellationClaimLostError extends Error {
  constructor() {
    super("Cancellation claim was lost.");
    this.name = "CancellationClaimLostError";
  }
}

export type CancellationRetryDependencies = Readonly<{
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}>;

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function backoffMilliseconds(retryNumber: number, random: () => number): number {
  const ceiling = Math.min(
    BASE_BACKOFF_MS * (2 ** (retryNumber - 1)),
    MAX_BACKOFF_MS,
  );
  const jitter = Math.min(Math.max(random(), 0), 1);
  return Math.floor(jitter * ceiling);
}

async function waitForRetry(
  retryNumber: number,
  random: () => number,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<void> {
  try {
    await sleep(backoffMilliseconds(retryNumber, random));
  } catch {
    throw new CancelOrderError("FAILED");
  }
}

/** Retries complete cancellation transactions, never individual statements. */
export async function retryCancellationTransaction<T>(
  runAttempt: (attempt: number) => Promise<T>,
  dependencies: CancellationRetryDependencies = {},
): Promise<T> {
  const random = dependencies.random ?? Math.random;
  const sleep = dependencies.sleep ?? defaultSleep;

  for (let attempt = 1; attempt <= 1 + MAX_CANCELLATION_CONCURRENCY_RETRIES; attempt += 1) {
    try {
      return await runAttempt(attempt);
    } catch (error) {
      if (error instanceof CancelOrderError) throw error;
      if (
        !(error instanceof CancellationClaimLostError)
        && !isTransactionConflict(error)
      ) {
        throw new CancelOrderError("FAILED");
      }
      if (attempt > MAX_CANCELLATION_CONCURRENCY_RETRIES) {
        throw new CancelOrderError("CONFLICT_RETRY_EXHAUSTED");
      }
      await waitForRetry(attempt, random, sleep);
    }
  }

  throw new CancelOrderError("CONFLICT_RETRY_EXHAUSTED");
}
