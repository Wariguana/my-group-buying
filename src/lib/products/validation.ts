import "server-only";

import { z } from "zod";

const MAX_POSTGRES_INTEGER = 2_147_483_647;

const optionalText = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  },
  z.string().nullable().optional(),
);

const optionalHttpUrl = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  },
  z.string().nullable().optional().refine(
    (value) => {
      if (value == null) return true;
      if (!/^https?:\/\//i.test(value)) return false;
      try {
        const url = new URL(value);
        return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
      } catch {
        return false;
      }
    },
    "請輸入有效的 http 或 https 圖片網址。",
  ),
);

const integerTwdAmount = z.preprocess(
  (value) => {
    if (typeof value === "number") return value;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return value;
    return Number(trimmed);
  },
  z.number({ error: "請輸入整數金額。" })
    .int("請輸入整數金額。")
    .min(0, "金額不可小於 0。")
    .max(MAX_POSTGRES_INTEGER, "金額超出可接受範圍。"),
);

const optionalSupplierId = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  },
  z.uuid("供應商資料無效。").nullable(),
);

const editableProductFields = {
  name: z.string().trim().min(1, "請輸入商品名稱。"),
  description: optionalText,
  imageUrl: optionalHttpUrl,
  defaultPrice: integerTwdAmount,
  cost: integerTwdAmount,
  unit: z.string().trim().min(1, "請輸入單位。"),
  supplierId: optionalSupplierId,
};

export const createProductSchema = z.object(editableProductFields).strict();
export const updateProductSchema = z.object(editableProductFields).strict();
export const productIdSchema = z.uuid();
export const productStatusMutationSchema = z.object({
  id: productIdSchema,
  isActive: z.boolean(),
}).strict();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
