import "server-only";

import { isTransactionConflict } from "@/lib/orders/errors";
import { PickupOrderError } from "@/lib/orders/pickup-errors";

export const MAX_PICKUP_CONCURRENCY_RETRIES = 2;

const BASE_BACKOFF_MS = 25;
const MAX_BACKOFF_MS = 100;

export class PickupClaimLostError extends Error {
  constructor() {
    super("Pickup claim was lost.");
    this.name = "PickupClaimLostError";
  }
}

export type PickupRetryDependencies = Readonly<{
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
    throw new PickupOrderError("FAILED");
  }
}

/** Retries complete pickup transactions, never individual statements. */
export async function retryPickupTransaction<T>(
  runAttempt: (attempt: number) => Promise<T>,
  dependencies: PickupRetryDependencies = {},
): Promise<T> {
  const random = dependencies.random ?? Math.random;
  const sleep = dependencies.sleep ?? defaultSleep;

  for (let attempt = 1; attempt <= 1 + MAX_PICKUP_CONCURRENCY_RETRIES; attempt += 1) {
    try {
      return await runAttempt(attempt);
    } catch (error) {
      if (error instanceof PickupOrderError) throw error;
      if (
        !(error instanceof PickupClaimLostError)
        && !isTransactionConflict(error)
      ) {
        throw new PickupOrderError("FAILED");
      }
      if (attempt > MAX_PICKUP_CONCURRENCY_RETRIES) {
        throw new PickupOrderError("CONFLICT_RETRY_EXHAUSTED");
      }
      await waitForRetry(attempt, random, sleep);
    }
  }

  throw new PickupOrderError("CONFLICT_RETRY_EXHAUSTED");
}
