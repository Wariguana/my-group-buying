import "server-only";

import { z } from "zod";

export const skuIdSchema = z.uuid().transform((value) => value.toLowerCase());
export const productOptionNameSchema = z.string().trim().min(1).max(80);
export const createProductSkuSchema = z.strictObject({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,63}$/)
    .refine((code) => !code.startsWith("DEFAULT-"), "Reserved default SKU code."),
  optionValueIds: z.array(skuIdSchema).min(1).max(20)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate option value."),
});

/** Stable IDs, not mutable display labels, define a combination. */
export function skuCombinationKey(optionValueIds: readonly string[]): string {
  const ids = skuIdSchema.array().max(20).parse(optionValueIds);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate option value.");
  return ids.length ? [...ids].sort().join(",") : "default";
}

export function defaultSkuIdentity(productId: unknown) {
  const id = skuIdSchema.parse(productId);
  // Product and SKU have separate UUID namespaces/tables. Never infer variants
  // from a legacy product's display name or group-buy stock.
  return { id, productId: id, code: `DEFAULT-${id.toUpperCase()}`, combinationKey: "default" } as const;
}
