import "server-only";

import { isTransactionConflict } from "@/lib/orders/errors";

export const MAX_GROUP_BUY_TRANSACTION_ATTEMPTS = 3;
export const GROUP_BUY_RETRY_BASE_DELAY_MS = 25;
export const GROUP_BUY_RETRY_MAX_DELAY_MS = 50;

export type GroupBuyRetryDependencies = Readonly<{
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}>;

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function groupBuyRetryDelayMilliseconds(
  retryNumber: number,
  random: () => number,
): number {
  const ceiling = Math.min(
    GROUP_BUY_RETRY_BASE_DELAY_MS * (2 ** (retryNumber - 1)),
    GROUP_BUY_RETRY_MAX_DELAY_MS,
  );
  const jitter = Math.min(Math.max(random(), 0), 1);
  return Math.floor(jitter * ceiling);
}

/** Retries complete Serializable Group Buy transaction attempts. */
export async function retryGroupBuyTransaction<T>(
  runAttempt: () => Promise<T>,
  dependencies: GroupBuyRetryDependencies = {},
): Promise<T> {
  const random = dependencies.random ?? Math.random;
  const sleep = dependencies.sleep ?? defaultSleep;

  for (let attempt = 1; attempt <= MAX_GROUP_BUY_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await runAttempt();
    } catch (error) {
      if (
        !isTransactionConflict(error)
        || attempt === MAX_GROUP_BUY_TRANSACTION_ATTEMPTS
      ) {
        throw error;
      }

      const retryNumber = attempt;
      const milliseconds = groupBuyRetryDelayMilliseconds(retryNumber, random);
      await sleep(milliseconds);
    }
  }

  throw new Error("Unreachable Group Buy transaction retry state.");
}
