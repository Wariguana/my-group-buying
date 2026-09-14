import "server-only";

export type PickupOrderErrorCode = "ACCESS_DENIED" | "CANCELLED" | "CONFLICT_RETRY_EXHAUSTED" | "FAILED";

const messages: Record<PickupOrderErrorCode, string> = {
  ACCESS_DENIED: "Order access was denied.",
  CANCELLED: "The order is cancelled.",
  CONFLICT_RETRY_EXHAUSTED: "The pickup conflicted with another request.",
  FAILED: "The pickup failed.",
};

export class PickupOrderError extends Error {
  constructor(public readonly code: PickupOrderErrorCode) {
    super(messages[code]);
    this.name = "PickupOrderError";
  }
}
