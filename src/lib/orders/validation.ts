import "server-only";

import { z } from "zod";
import { canonicalizeTaiwanMobilePhone } from "@/lib/orders/phone";
import { ORDER_PUBLIC_CODE_PATTERN } from "@/lib/orders/public-code";

export const adminCancelOrderInputSchema = z.strictObject({
  publicCode: z.string().regex(ORDER_PUBLIC_CODE_PATTERN),
});

export const adminPickupOrderInputSchema = z.strictObject({
  publicCode: z.string().regex(ORDER_PUBLIC_CODE_PATTERN),
});

export const adminPaymentOrderInputSchema = z.strictObject({
  publicCode: z.string().regex(ORDER_PUBLIC_CODE_PATTERN),
});

const customerPhoneSchema = z.string().transform((value, context) => {
  const canonical = canonicalizeTaiwanMobilePhone(value);
  if (canonical === null) {
    context.addIssue({ code: "custom", message: "請輸入有效的台灣手機號碼。" });
    return z.NEVER;
  }
  return canonical;
});

function canonicalUuidSchema(message: string) {
  return z.uuid(message).transform((value) => value.toLowerCase());
}

const orderItemInputSchema = z.strictObject({
  groupBuyItemId: canonicalUuidSchema("商品資料無效。"),
  quantity: z.number({ error: "數量必須是整數。" })
    .int("數量必須是整數。")
    .min(1, "數量必須至少為 1。")
    .max(2_147_483_647, "數量超出可接受範圍。"),
});

const orderBase = {
  customerName: z.string().trim().min(1, "請輸入訂購人姓名。"),
  customerPhone: customerPhoneSchema,
  items: z.array(orderItemInputSchema).min(1, "請至少選擇一項商品。"),
};

const fulfillmentOrderInputSchema = z.discriminatedUnion("fulfillmentMethod", [
  z.strictObject({
    ...orderBase,
    fulfillmentMethod: z.literal("SELF_PICKUP"),
    groupBuyPickupId: canonicalUuidSchema("取貨地點資料無效。"),
  }),
  z.strictObject({
    ...orderBase,
    fulfillmentMethod: z.literal("SEVEN_ELEVEN"),
    storeSelectionToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "7-ELEVEN 門市選擇無效。"),
  }),
]);

export const orderInputSchema = z.preprocess((value) => {
  if (typeof value !== "object" || value === null || "fulfillmentMethod" in value) return value;
  return { ...value, fulfillmentMethod: "SELF_PICKUP" };
}, fulfillmentOrderInputSchema).superRefine((value, context) => {
  const itemIds = value.items.map((item) => item.groupBuyItemId);
  if (new Set(itemIds).size !== itemIds.length) {
    context.addIssue({ code: "custom", path: ["items"], message: "商品不可重複選擇。" });
  }
});

export type OrderInput = z.infer<typeof orderInputSchema>;
