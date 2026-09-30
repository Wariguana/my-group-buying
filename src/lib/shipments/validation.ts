import "server-only";

import { z } from "zod";
import { ORDER_PUBLIC_CODE_PATTERN } from "@/lib/orders/public-code";

export const adminCreateShipmentInputSchema = z.strictObject({
  publicCode: z.string().regex(ORDER_PUBLIC_CODE_PATTERN),
  trackingNumber: z.string().trim().min(1).max(128),
});

export const adminTransitionShipmentInputSchema = z.strictObject({
  shipmentId: z.uuid().refine((value) => value === value.toLowerCase()),
});
