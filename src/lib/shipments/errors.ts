import "server-only";

export type ShipmentErrorCode = "INVALID_SHIPMENT_INPUT" | "ACCESS_DENIED" | "ORDER_NOT_ELIGIBLE" |
  "ACTIVE_SHIPMENT_EXISTS" | "TRACKING_NUMBER_IN_USE" | "INVALID_TRANSITION" |
  "CONFLICT_RETRY_EXHAUSTED" | "FAILED";

const messages: Record<ShipmentErrorCode, string> = {
  INVALID_SHIPMENT_INPUT: "Invalid shipment input.",
  ACCESS_DENIED: "Shipment access was denied.",
  ORDER_NOT_ELIGIBLE: "The order is not eligible for shipment.",
  ACTIVE_SHIPMENT_EXISTS: "The order already has an active shipment.",
  TRACKING_NUMBER_IN_USE: "The tracking number is already in use.",
  INVALID_TRANSITION: "The shipment transition is not allowed.",
  CONFLICT_RETRY_EXHAUSTED: "The shipment conflicted with another request.",
  FAILED: "The shipment operation failed.",
};

export class ShipmentError extends Error {
  constructor(public readonly code: ShipmentErrorCode) {
    super(messages[code]);
    this.name = "ShipmentError";
  }
}
