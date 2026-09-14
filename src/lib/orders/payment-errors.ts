import "server-only";

export type PaymentOrderErrorCode = "ACCESS_DENIED" | "CANCELLED" | "CONFLICT_RETRY_EXHAUSTED" | "FAILED";

const messages: Record<PaymentOrderErrorCode, string> = {
  ACCESS_DENIED: "Order access was denied.",
  CANCELLED: "The order is cancelled.",
  CONFLICT_RETRY_EXHAUSTED: "The payment conflicted with another request.",
  FAILED: "The payment failed.",
};

export class PaymentOrderError extends Error {
  constructor(public readonly code: PaymentOrderErrorCode) {
    super(messages[code]);
    this.name = "PaymentOrderError";
  }
}
