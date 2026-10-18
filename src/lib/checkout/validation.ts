import { z } from "zod";
import { cartSchema, id, shippingMethods } from "@/lib/commerce/validation";
export const checkoutInput = z.strictObject({
    requestId: id, quoteFingerprint: z.string().regex(/^[0-9a-f]{64}$/).optional(), lines: cartSchema.refine(lines => lines.length > 0),
    customerName: z.string().trim().min(1).max(80), customerPhone: z.string().regex(/^09\d{8}$/),
    method: z.enum(shippingMethods), address: z.string().trim().max(300),
    selectionToken: z.string().max(64).optional(),
});
export const reasons = ["查無相符入帳", "金額不符", "末五碼不符", "截圖不清", "截圖疑似錯誤", "疑似重複付款", "其他"] as const;
export const receiptInput = z.strictObject({ requestId: id, bankReference: z.string().trim().min(1).max(120),
    amount: z.number().int().min(1).max(1000000000), bankReceivedAt: z.iso.datetime(), note: z.string().trim().min(3).max(500), confirmed: z.literal(true) });
export const rateInput = z.strictObject({ method: z.enum(shippingMethods), temperature: z.enum(["AMBIENT", "CHILLED", "FROZEN"]), enabled: z.boolean(),
    fee: z.number().int().min(0).max(10000000), freeThreshold: z.number().int().min(0).max(1000000000).nullable(),
    maxWeightGrams: z.number().int().min(1).max(10000000), maxLengthMm: z.number().int().min(1).max(100000),
    maxWidthMm: z.number().int().min(1).max(100000), maxHeightMm: z.number().int().min(1).max(100000), capabilityEvidence: z.string().trim().min(3).max(500) });
export const bankInput = z.strictObject({ bankName: z.string().trim().min(1).max(80), bankCode: z.string().regex(/^\d{3}$/),
    bankAccount: z.string().regex(/^\d{6,20}$/), accountName: z.string().trim().min(1).max(80), enabled: z.boolean() });
