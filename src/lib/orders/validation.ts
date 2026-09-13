import "server-only";

import { z } from "zod";
import { canonicalizeTaiwanMobilePhone } from "@/lib/orders/phone";

const customerPhoneSchema = z.string().transform((value, context) => {
  const canonical = canonicalizeTaiwanMobilePhone(value);
  if (canonical === null) {
    context.addIssue({ code: "custom", message: "請輸入有效的台灣手機號碼。" });
    return z.NEVER;
  }
  return canonical;
});

const orderItemInputSchema = z.strictObject({
  groupBuyItemId: z.uuid("商品資料無效。"),
  quantity: z.number({ error: "數量必須是整數。" })
    .int("數量必須是整數。")
    .min(1, "數量必須至少為 1。")
    .max(2_147_483_647, "數量超出可接受範圍。"),
});

export const orderInputSchema = z.strictObject({
  customerName: z.string().trim().min(1, "請輸入訂購人姓名。"),
  customerPhone: customerPhoneSchema,
  groupBuyPickupId: z.uuid("取貨地點資料無效。"),
  items: z.array(orderItemInputSchema).min(1, "請至少選擇一項商品。"),
}).superRefine((value, context) => {
  const itemIds = value.items.map((item) => item.groupBuyItemId);
  if (new Set(itemIds).size !== itemIds.length) {
    context.addIssue({ code: "custom", path: ["items"], message: "商品不可重複選擇。" });
  }
});

export type OrderInput = z.infer<typeof orderInputSchema>;
