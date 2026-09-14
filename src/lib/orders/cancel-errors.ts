import "server-only";

export type CancelOrderErrorCode =
  | "ACCESS_DENIED"
  | "ALREADY_PICKED_UP"
  | "ALREADY_PAID"
  | "CANCELLATION_CLOSED"
  | "CONFLICT_RETRY_EXHAUSTED"
  | "FAILED";

const messages: Record<CancelOrderErrorCode, string> = {
  ACCESS_DENIED: "Order access was denied.",
  ALREADY_PICKED_UP: "The order has already been picked up.",
  ALREADY_PAID: "Payment has already been confirmed for the order.",
  CANCELLATION_CLOSED: "Customer cancellation is closed.",
  CONFLICT_RETRY_EXHAUSTED: "The cancellation conflicted with another request.",
  FAILED: "The cancellation failed.",
};

export class CancelOrderError extends Error {
  constructor(public readonly code: CancelOrderErrorCode) {
    super(messages[code]);
    this.name = "CancelOrderError";
  }
}
