import "server-only";

import { z } from "zod";
import { parseTaipeiDateTimeLocal } from "@/lib/group-buys/time";

const MAX_POSTGRES_INTEGER = 2_147_483_647;

const optionalText = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}, z.string().nullable().optional().transform((value) => value ?? null));

const optionalHttpUrl = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}, z.string().nullable().optional().refine((value) => {
  if (value == null) return true;
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}, "請輸入有效的 http 或 https 圖片網址。").transform((value) => value ?? null));

function integerInput({ nullable }: { nullable: boolean }) {
  return z.preprocess((value) => {
    if (nullable && (value == null || value === "")) return null;
    if (typeof value === "number") return value;
    if (typeof value !== "string" || !/^\d+$/.test(value)) return value;
    return Number(value);
  }, nullable
    ? z.number({ error: "請輸入 0 以上的整數。" }).int().min(0).max(MAX_POSTGRES_INTEGER).nullable()
    : z.number({ error: "請輸入 0 以上的整數。" }).int().min(0).max(MAX_POSTGRES_INTEGER));
}

const taipeiDateTime = z.preprocess((value) => {
  if (value instanceof Date) return value;
  return typeof value === "string" ? parseTaipeiDateTimeLocal(value) ?? value : value;
}, z.date({ error: "請輸入有效的日期與時間。" }));

const nullableTaipeiDateTime = z.preprocess((value) => {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value;
  return typeof value === "string" ? parseTaipeiDateTimeLocal(value) ?? value : value;
}, z.date({ error: "請輸入有效的日期與時間。" }).nullable());

export const groupBuyIdSchema = z.uuid();
export const groupBuySalePriceSchema = integerInput({ nullable: false });
export const groupBuyNullableIntegerSchema = integerInput({ nullable: true });

export const groupBuyItemInputSchema = z.object({
  productId: z.uuid("商品資料無效。"),
  salePrice: z.preprocess(
    (value) => value == null || value === "" ? null : value,
    groupBuySalePriceSchema.nullable(),
  ),
  stock: groupBuyNullableIntegerSchema,
  purchaseLimit: groupBuyNullableIntegerSchema,
}).strict();

export const groupBuyPickupInputSchema = z.object({
  pickupLocationId: z.uuid("取貨地點資料無效。"),
  pickupStartAt: nullableTaipeiDateTime,
  pickupEndAt: nullableTaipeiDateTime,
}).strict().superRefine((value, context) => {
  const hasStart = value.pickupStartAt !== null;
  const hasEnd = value.pickupEndAt !== null;
  if (hasStart !== hasEnd) {
    context.addIssue({ code: "custom", path: [hasStart ? "pickupEndAt" : "pickupStartAt"], message: "取貨開始與結束時間必須同時填寫。" });
    return;
  }
  if (value.pickupStartAt && value.pickupEndAt && value.pickupStartAt >= value.pickupEndAt) {
    context.addIssue({ code: "custom", path: ["pickupEndAt"], message: "取貨結束時間必須晚於開始時間。" });
  }
});

const editableDraftFields = {
  title: z.string().trim().min(1, "請輸入團購名稱。"),
  description: optionalText,
  coverImageUrl: optionalHttpUrl,
  startAt: taipeiDateTime,
  endAt: taipeiDateTime,
  items: z.array(groupBuyItemInputSchema),
  pickups: z.array(groupBuyPickupInputSchema),
};

function addAggregateRules(value: {
  startAt: Date;
  endAt: Date;
  items: { productId: string }[];
  pickups: { pickupLocationId: string }[];
}, context: z.RefinementCtx) {
  if (value.startAt >= value.endAt) {
    context.addIssue({ code: "custom", path: ["endAt"], message: "結束時間必須晚於開始時間。" });
  }
  if (new Set(value.items.map((item) => item.productId)).size !== value.items.length) {
    context.addIssue({ code: "custom", path: ["items"], message: "商品不可重複選擇。" });
  }
  if (new Set(value.pickups.map((pickup) => pickup.pickupLocationId)).size !== value.pickups.length) {
    context.addIssue({ code: "custom", path: ["pickups"], message: "取貨地點不可重複選擇。" });
  }
}

export const createGroupBuyDraftSchema = z.object(editableDraftFields).strict().superRefine(addAggregateRules);
export const updateGroupBuyDraftSchema = z.object(editableDraftFields).strict().superRefine(addAggregateRules);

export type CreateGroupBuyDraftInput = z.infer<typeof createGroupBuyDraftSchema>;
export type UpdateGroupBuyDraftInput = z.infer<typeof updateGroupBuyDraftSchema>;
