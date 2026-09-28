import "server-only";

import { isTransactionConflict } from "@/lib/orders/errors";
import { ShipmentError } from "@/lib/shipments/errors";

export class ShipmentClaimLostError extends Error {}

export async function retryShipmentTransaction<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ShipmentError) throw error;
      if (!(error instanceof ShipmentClaimLostError) && !isTransactionConflict(error)) {
        throw new ShipmentError("FAILED");
      }
      if (attempt === 2) throw new ShipmentError("CONFLICT_RETRY_EXHAUSTED");
      await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 25 * (attempt + 1))));
    }
  }
  throw new ShipmentError("CONFLICT_RETRY_EXHAUSTED");
}
