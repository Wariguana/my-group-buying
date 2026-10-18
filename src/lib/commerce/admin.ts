import "server-only";
import { getDb } from "@/lib/db";
import { createProductOption, createProductOptionValue, createProductSku, ensureDefaultProductSku } from "@/lib/products/sku-service";
import { adminMutation } from "./validation";
import { adjustInventory } from "./inventory";

// Callers MUST authenticate; the sole public action calls requireAdmin first.
export async function mutateCommerce(input: unknown, actorId: string) {
  const d = adminMutation.parse(input);
  const db = getDb();
  switch (d.operation) {
    case "inventory": return adjustInventory(input, actorId);
    case "option": return createProductOption(d.productId, d.name);
    case "value": return createProductOptionValue(d.productId, d.optionId, d.value);
    case "sku": return createProductSku(d.productId, { code: d.code, optionValueIds: d.optionValueIds });
    case "defaultSku": return ensureDefaultProductSku(d.productId);
    case "category": {
      const data = { name: d.name, sortOrder: d.sortOrder, isActive: d.isActive };
      if (d.id) return db.category.update({ where: { id: d.id }, data });
      return db.category.create({ data });
    }
    case "skuEdit": {
      const { id, operation: _operation, ...data } = d;
      void _operation;
      const old = await db.productSku.findUniqueOrThrow({ where: { id } });
      if (data.code !== old.code && (old.code.startsWith("DEFAULT-") || data.code.startsWith("DEFAULT-"))) throw new Error("預設 SKU code 對應必須保留。");
      return db.productSku.update({ where: { id }, data });
    }
    case "offer": {
      const { operation: _operation, ...data } = d;
      void _operation;
      return db.groupBuySku.upsert({ where: { groupBuyId_skuId: { groupBuyId: d.groupBuyId, skuId: d.skuId } }, create: data, update: data });
    }
    case "group": {
      return db.$transaction(async (tx) => {
        const existing = await tx.groupBuy.findUniqueOrThrow({ where: { id: d.id } });
        if (d.categoryId && d.categoryId !== existing.categoryId && !await tx.category.findFirst({ where: { id: d.categoryId, isActive: true } })) throw new Error("分類不存在或已停用。");
        if (existing.endAt <= new Date() && d.categoryId !== existing.categoryId) throw new Error("已截止開團保留原分類。");
        if (d.visibility === "PUBLISHED") {
          if (existing.endAt <= new Date()) throw new Error("已截止，不能重新上架。");
          const offers = await tx.groupBuySku.count({ where: { groupBuyId: d.id, isActive: true, sku: { isActive: true, product: { isActive: true, skuInventoryEnabled: true }, inventory: { isNot: null } } } });
          if (!offers) throw new Error("上架需要至少一個已盤點、啟用的 SKU 販售項目。");
        }
        return tx.groupBuy.update({ where: { id: d.id }, data: { categoryId: d.categoryId, isFeatured: d.isFeatured, featuredSort: d.featuredSort,
          allowsCombinedShipping: d.allowsCombinedShipping, isArchived: d.visibility === "ARCHIVED",
          status: d.visibility === "UNLISTED" || d.visibility === "ARCHIVED" ? "CANCELLED" : d.visibility,
          publishedAt: d.visibility === "PUBLISHED" && !existing.publishedAt ? new Date() : existing.publishedAt } });
      });
    }
  }
}
