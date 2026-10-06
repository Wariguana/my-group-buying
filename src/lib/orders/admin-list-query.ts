import "server-only";

import { z } from "zod";
import { ORDER_NUMBER_PATTERN } from "@/lib/orders/order-number";
import { ORDER_PUBLIC_CODE_PATTERN } from "@/lib/orders/public-code";

export const ADMIN_ORDER_PAGE_SIZE = 50;

export const adminOrderListInputSchema = z.strictObject({
  orderNumber: z.string().length(12).regex(ORDER_NUMBER_PATTERN).optional(),
  status: z.enum(["PLACED", "CANCELLED"]).optional(),
  fulfillment: z.enum(["SELF_PICKUP", "SEVEN_ELEVEN"]).optional(),
  queue: z.enum([
    "UNPAID", "SELF_PICKUP_PENDING", "SHIPMENT_TO_CREATE", "SHIPMENT_CREATED",
    "SHIPMENT_SHIPPED", "SHIPMENT_ARRIVED", "SHIPMENT_RETURNED",
  ]).optional(),
  navigation: z.strictObject({
    direction: z.enum(["OLDER", "NEWER"]),
    anchorPublicCode: z.string().length(20).regex(ORDER_PUBLIC_CODE_PATTERN),
  }).optional(),
}).superRefine((value, context) => {
  if (value.queue && value.status === "CANCELLED") {
    context.addIssue({ code: "custom", path: ["status"], message: "Queue requires placed orders." });
  }
  if (value.queue === "SELF_PICKUP_PENDING" && value.fulfillment === "SEVEN_ELEVEN") {
    context.addIssue({ code: "custom", path: ["fulfillment"], message: "Queue requires self pickup." });
  }
  if (value.queue?.startsWith("SHIPMENT_") && value.fulfillment === "SELF_PICKUP") {
    context.addIssue({ code: "custom", path: ["fulfillment"], message: "Queue requires 7-ELEVEN shipment." });
  }
});

export type AdminOrderListInput = Readonly<z.infer<typeof adminOrderListInputSchema>>;
export type AdminOrderListQueryResult =
  | Readonly<{ ok: true; value: AdminOrderListInput }>
  | Readonly<{ ok: false; error: "INVALID_QUERY" }>;

// Bound the raw value before trimming. Arrays (including repeated empty values)
// are rejected instead of selecting one attacker-controlled interpretation.
const optionalQueryValue = z.string().max(64).trim()
  .transform((value) => value === "" ? undefined : value).optional();
const searchParamsSchema = z.strictObject({
  orderNumber: optionalQueryValue,
  status: optionalQueryValue,
  fulfillment: optionalQueryValue,
  queue: optionalQueryValue,
  after: z.string().length(20).regex(ORDER_PUBLIC_CODE_PATTERN).optional(),
  before: z.string().length(20).regex(ORDER_PUBLIC_CODE_PATTERN).optional(),
  // Next's RSC transport marker is not a business filter.
  _rsc: z.string().max(64).optional(),
}).refine((value) => value.after === undefined || value.before === undefined);

export function parseAdminOrderListSearchParams(input: unknown): AdminOrderListQueryResult {
  const url = searchParamsSchema.safeParse(input);
  if (!url.success) return { ok: false, error: "INVALID_QUERY" };
  const { orderNumber, status, fulfillment, queue, after, before } = url.data;
  const parsed = adminOrderListInputSchema.safeParse({
    ...(orderNumber === undefined ? {} : { orderNumber }),
    ...(status === undefined ? {} : { status }),
    ...(fulfillment === undefined ? {} : { fulfillment }),
    ...(queue === undefined ? {} : { queue }),
    ...(after === undefined && before === undefined ? {} : {
      navigation: {
        direction: after === undefined ? "NEWER" : "OLDER",
        anchorPublicCode: after ?? before,
      },
    }),
  });
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: "INVALID_QUERY" };
}
