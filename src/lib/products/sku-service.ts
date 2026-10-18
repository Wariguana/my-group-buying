import "server-only";

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  createProductSkuSchema, defaultSkuIdentity, productOptionNameSchema,
  skuCombinationKey, skuIdSchema,
} from "@/lib/products/sku-validation";

// Internal Admin services: any future public action must requireAdmin first.
// No SKU service writes legacy prices, stock, order items, or payment state.
export async function createProductOption(productId: unknown, name: unknown) {
  return getDb().productOption.create({
    data: { productId: skuIdSchema.parse(productId), name: productOptionNameSchema.parse(name) },
  });
}

export async function createProductOptionValue(productId: unknown, optionId: unknown, value: unknown) {
  return getDb().productOptionValue.create({
    data: {
      productId: skuIdSchema.parse(productId), optionId: skuIdSchema.parse(optionId),
      value: productOptionNameSchema.parse(value),
    },
  });
}

export async function createProductSku(productId: unknown, input: unknown) {
  const id = skuIdSchema.parse(productId);
  const parsed = createProductSkuSchema.parse(input);
  return getDb().$transaction(async (tx) => {
    const values = await tx.productOptionValue.findMany({
      where: { productId: id, id: { in: parsed.optionValueIds } },
      select: { id: true, optionId: true },
    });
    if (values.length !== parsed.optionValueIds.length ||
        new Set(values.map((value) => value.optionId)).size !== values.length) {
      throw new Error("Options must belong to this product and select at most one value per dimension.");
    }
    return tx.productSku.create({ data: {
      productId: id, code: parsed.code, combinationKey: skuCombinationKey(parsed.optionValueIds),
      options: { create: values.map((value) => ({
        optionId: value.optionId, optionValueId: value.id,
      })) },
    } });
  });
}

export async function setProductSkuActive(skuId: unknown, isActive: unknown) {
  return getDb().productSku.update({
    where: { id: skuIdSchema.parse(skuId) }, data: { isActive: z.boolean().parse(isActive) },
  });
}

/** Explicit compatibility mapping; reruns preserve identity and activation. */
export async function ensureDefaultProductSku(productId: unknown) {
  const identity = defaultSkuIdentity(productId);
  return getDb().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ isActive: boolean }[]>(Prisma.sql`
      SELECT "isActive" FROM "Product" WHERE id = ${identity.productId}::uuid FOR UPDATE
    `);
    if (rows.length !== 1) throw new Error("Product not found.");
    const existing = await tx.productSku.findUnique({
      where: { productId_combinationKey: { productId: identity.productId, combinationKey: "default" } },
    });
    if (existing) return existing;
    if (await tx.productOption.count({ where: { productId: identity.productId } }) ||
        await tx.productSku.count({ where: { productId: identity.productId } })) {
      throw new Error("SKU mapping requires manual review.");
    }
    return tx.productSku.create({ data: { ...identity, isActive: rows[0].isActive } });
  });
}
