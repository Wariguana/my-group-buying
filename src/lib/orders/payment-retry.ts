import "server-only";

import { isTransactionConflict } from "@/lib/orders/errors";
import { PaymentOrderError } from "@/lib/orders/payment-errors";

export const MAX_PAYMENT_CONCURRENCY_RETRIES = 2;

const BASE_BACKOFF_MS = 25;
const MAX_BACKOFF_MS = 100;

export class PaymentClaimLostError extends Error {
  constructor() {
    super("Payment claim was lost.");
    this.name = "PaymentClaimLostError";
  }
}

export type PaymentRetryDependencies = Readonly<{
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
    throw new PaymentOrderError("FAILED");
  }
}

/** Retries complete payment transactions, never individual statements. */
export async function retryPaymentTransaction<T>(
  runAttempt: (attempt: number) => Promise<T>,
  dependencies: PaymentRetryDependencies = {},
): Promise<T> {
  const random = dependencies.random ?? Math.random;
  const sleep = dependencies.sleep ?? defaultSleep;

  for (let attempt = 1; attempt <= 1 + MAX_PAYMENT_CONCURRENCY_RETRIES; attempt += 1) {
    try {
      return await runAttempt(attempt);
    } catch (error) {
      if (error instanceof PaymentOrderError) throw error;
      if (
        !(error instanceof PaymentClaimLostError)
        && !isTransactionConflict(error)
      ) {
        throw new PaymentOrderError("FAILED");
      }
      if (attempt > MAX_PAYMENT_CONCURRENCY_RETRIES) {
        throw new PaymentOrderError("CONFLICT_RETRY_EXHAUSTED");
      }
      await waitForRetry(attempt, random, sleep);
    }
  }

  throw new PaymentOrderError("CONFLICT_RETRY_EXHAUSTED");
}
