import "server-only";

import { OrderDomainError } from "@/lib/orders/errors";

export const MAX_POSTGRES_INTEGER = 2_147_483_647;
const MAX_POSTGRES_INTEGER_BIGINT = BigInt(MAX_POSTGRES_INTEGER);

export type OrderMoneyLine = Readonly<{
  price: number;
  quantity: number;
}>;

function assertStoredInteger(value: number, minimum: number): void {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > MAX_POSTGRES_INTEGER
  ) {
    throw new OrderDomainError("INVALID_ORDER_INPUT");
  }
}

function calculateOrderLineAmountBigInt(price: number, quantity: number): bigint {
  assertStoredInteger(price, 0);
  assertStoredInteger(quantity, 1);

  const amount = BigInt(price) * BigInt(quantity);
  if (amount > MAX_POSTGRES_INTEGER_BIGINT) {
    throw new OrderDomainError("INVALID_ORDER_INPUT");
  }
  return amount;
}

export function calculateOrderLineAmount(price: number, quantity: number): number {
  return Number(calculateOrderLineAmountBigInt(price, quantity));
}

export function calculateOrderTotal(lines: readonly OrderMoneyLine[]): number {
  let total = BigInt(0);
  for (const line of lines) {
    total += calculateOrderLineAmountBigInt(line.price, line.quantity);
    if (total > MAX_POSTGRES_INTEGER_BIGINT) {
      throw new OrderDomainError("INVALID_ORDER_INPUT");
    }
  }
  return Number(total);
}
