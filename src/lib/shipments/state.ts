export type ShipmentState = "CREATED" | "SHIPPED" | "ARRIVED" | "PICKED_UP" | "RETURNED" | "VOIDED";

export type ShipmentStateInput = Readonly<{
  id: string;
  shippedAt: Date | null;
  arrivedAt: Date | null;
  returnedAt: Date | null;
  voidedAt: Date | null;
}>;

/** Never attribute an order-level pickup to a terminal historical shipment. */
export function deriveShipmentState(
  shipment: ShipmentStateInput,
  context: Readonly<{ pickedUpAt: Date | null; activeShipmentId: string | null; shipmentRequired: boolean }>,
): ShipmentState {
  if (shipment.voidedAt !== null) return "VOIDED";
  if (shipment.returnedAt !== null) return "RETURNED";
  if (context.shipmentRequired && context.pickedUpAt !== null &&
      (context.activeShipmentId !== shipment.id || shipment.arrivedAt === null)) {
    throw new Error("Inconsistent shipment pickup state.");
  }
  if (context.pickedUpAt !== null && context.activeShipmentId === shipment.id && shipment.arrivedAt !== null) {
    return "PICKED_UP";
  }
  if (shipment.arrivedAt !== null) return "ARRIVED";
  if (shipment.shippedAt !== null) return "SHIPPED";
  return "CREATED";
}
