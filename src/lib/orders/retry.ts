import "server-only";

import {
  isCustomerPhoneUniqueConflict,
  isOrderPublicCodeUniqueConflict,
  isTransactionConflict,
  OrderDomainError,
} from "@/lib/orders/errors";
import {
  generateOrderPublicCode,
  type OrderPublicCodeGenerator,
} from "@/lib/orders/public-code";

export const MAX_CONCURRENCY_RETRIES = 2;
export const MAX_PUBLIC_CODE_COLLISIONS = 2;
export const MAX_TRANSACTION_ATTEMPTS =
  1 + MAX_CONCURRENCY_RETRIES + MAX_PUBLIC_CODE_COLLISIONS;

const BASE_BACKOFF_MS = 25;
const MAX_BACKOFF_MS = 100;

export type OrderTransactionAttempt = Readonly<{
  attempt: number;
  publicCode: string;
}>;

export type OrderRetryDependencies = Readonly<{
  generatePublicCode?: OrderPublicCodeGenerator;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}>;

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function concurrencyBackoffMilliseconds(retryNumber: number, random: () => number): number {
  const ceiling = Math.min(
    BASE_BACKOFF_MS * (2 ** (retryNumber - 1)),
    MAX_BACKOFF_MS,
  );
  const jitter = Math.min(Math.max(random(), 0), 1);
  return Math.floor(jitter * ceiling);
}

function generatePublicCodeOrFail(
  generatePublicCode: OrderPublicCodeGenerator,
): string {
  try {
    return generatePublicCode();
  } catch {
    throw new OrderDomainError("FAILED");
  }
}

async function waitForConcurrencyRetry(
  retryNumber: number,
  random: () => number,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<void> {
  try {
    const milliseconds = concurrencyBackoffMilliseconds(retryNumber, random);
    await sleep(milliseconds);
  } catch {
    throw new OrderDomainError("FAILED");
  }
}

/** Retries complete Serializable transaction attempts, never individual queries. */
export async function retryOrderTransaction<T>(
  runAttempt: (context: OrderTransactionAttempt) => Promise<T>,
  dependencies: OrderRetryDependencies = {},
): Promise<T> {
  const generatePublicCode = dependencies.generatePublicCode ?? generateOrderPublicCode;
  const random = dependencies.random ?? Math.random;
  const sleep = dependencies.sleep ?? defaultSleep;
  let publicCode = generatePublicCodeOrFail(generatePublicCode);
  let concurrencyRetries = 0;
  let publicCodeCollisions = 0;

  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await runAttempt({ attempt, publicCode });
    } catch (error) {
      if (error instanceof OrderDomainError) throw error;

      if (isOrderPublicCodeUniqueConflict(error)) {
        if (publicCodeCollisions >= MAX_PUBLIC_CODE_COLLISIONS) {
          throw new OrderDomainError("CONFLICT_RETRY_EXHAUSTED");
        }
        publicCodeCollisions += 1;
        publicCode = generatePublicCodeOrFail(generatePublicCode);
        continue;
      }

      if (isTransactionConflict(error) || isCustomerPhoneUniqueConflict(error)) {
        if (concurrencyRetries >= MAX_CONCURRENCY_RETRIES) {
          throw new OrderDomainError("CONFLICT_RETRY_EXHAUSTED");
        }
        concurrencyRetries += 1;
        await waitForConcurrencyRetry(concurrencyRetries, random, sleep);
        continue;
      }

      throw new OrderDomainError("FAILED");
    }
  }

  throw new OrderDomainError("CONFLICT_RETRY_EXHAUSTED");
}
