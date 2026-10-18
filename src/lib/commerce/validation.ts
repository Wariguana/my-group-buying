import { z } from "zod";

export const id = z.uuid().transform((s) => s.toLowerCase());
export const amount = z.coerce.number().int().min(0).max(10_000_000);
export const quantity = z.coerce.number().int().min(1).max(9999);
const enabled = z.enum(["true", "false"]).transform((s) => s === "true");
export const shippingMethods = ["SEVEN_ELEVEN", "FAMILY_MART", "HOME_DELIVERY"] as const;
export const adminMutation = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("category"), id: id.optional(), name: z.string().trim().min(1).max(80), sortOrder: amount, isActive: enabled }),
  z.object({ operation: z.literal("option"), productId: id, name: z.string().trim().min(1).max(80) }),
  z.object({ operation: z.literal("value"), productId: id, optionId: id, value: z.string().trim().min(1).max(80) }),
  z.object({ operation: z.literal("sku"), productId: id, code: z.string(), optionValueIds: z.array(id).min(1).max(20) }),
  z.object({ operation: z.literal("defaultSku"), productId: id }),
  z.object({ operation: z.literal("skuEdit"), id, code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,63}$/), displayName: z.string().trim().max(160), isActive: enabled,
    temperature: z.enum(["AMBIENT", "CHILLED", "FROZEN"]), shippingMethods: z.array(z.enum(shippingMethods)).max(3),
    weightGrams: amount.nullable(), lengthMm: amount.nullable(), widthMm: amount.nullable(), heightMm: amount.nullable(), shippingNote: z.string().trim().max(500) }),
  z.object({ operation: z.literal("offer"), groupBuyId: id, skuId: id, salePrice: amount, purchaseLimit: quantity.nullable(), isActive: enabled }),
  z.object({ operation: z.literal("group"), id, categoryId: id.nullable(), isFeatured: enabled, featuredSort: amount, allowsCombinedShipping: enabled,
    visibility: z.enum(["DRAFT", "PUBLISHED", "UNLISTED", "ARCHIVED"]) }),
  z.object({ operation: z.literal("inventory"), skuId: id, requestId: id, kind: z.enum(["INITIAL", "RESTOCK", "REDUCE", "COUNT"]), value: amount,
    expectedVersion: z.coerce.number().int().min(0).max(2147483647), reason: z.string().trim().min(3).max(500), confirmed: z.literal("yes") }),
]);

// Only identifiers, quantity and a comparison price live in the browser. No PII.
export const cartLine = z.strictObject({ offerId: id, quantity: z.number().int().min(1).max(9999), expectedPrice: z.number().int().min(0).max(10_000_000) });
export const cartSchema = z.array(cartLine).max(100).refine((lines) => new Set(lines.map((l) => l.offerId)).size === lines.length, "Duplicate cart line");
export type CartLine = z.infer<typeof cartLine>;
