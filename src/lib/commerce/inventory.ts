import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { adminMutation, id } from "./validation";

export async function adjustInventory(input: unknown, actorId: unknown) {
  const data = adminMutation.parse(input);
  if (data.operation !== "inventory") throw new Error("無效庫存操作。");
  const actor = id.parse(actorId);
  return getDb().$transaction(async (tx) => {
    const sku = await tx.productSku.findUniqueOrThrow({ where: { id: data.skuId } });
    // The same Product lock is acquired by the legacy OrderItem INSERT guard.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Product" WHERE id = ${sku.productId}::uuid FOR UPDATE`);
    const previousRequest = await tx.inventoryMovement.findUnique({ where: { requestId: data.requestId } });
    if (previousRequest) {
      const requestedAfter = data.kind === "INITIAL" || data.kind === "COUNT" ? data.value
        : previousRequest.beforeOnHand + (data.kind === "REDUCE" ? -data.value : data.value);
      if (previousRequest.skuId !== sku.id || previousRequest.actorId !== actor || previousRequest.kind !== data.kind ||
          previousRequest.reason !== data.reason || previousRequest.afterOnHand !== requestedAfter) throw new Error("操作識別碼已使用，請重新整理。");
      return previousRequest;
    }
    const product = await tx.product.findUniqueOrThrow({ where: { id: sku.productId } });
    if (!product.skuInventoryEnabled) {
      const pending = await tx.orderItem.count({ where: { groupBuyItem: { productId: product.id }, order: { status: "PLACED", pickedUpAt: null } } });
      if (pending) throw new Error("尚有未履約舊單，請先完成履約或取消後再盤點切換。");
    }
    const stock = await tx.skuInventory.findUnique({ where: { skuId: sku.id } });
    if ((!stock && data.kind !== "INITIAL") || (stock && data.kind === "INITIAL")) throw new Error("起始盤點只能執行一次；後續請使用盤點調整。");
    if ((stock?.version ?? 0) !== data.expectedVersion) throw new Error("庫存已被其他操作更新，請重新整理後重試。");
    const before = stock?.onHand ?? 0;
    const after = data.kind === "INITIAL" || data.kind === "COUNT" ? data.value : before + (data.kind === "REDUCE" ? -data.value : data.value);
    if (after < (stock?.reserved ?? 0) + (stock?.allocated ?? 0) || after > 10_000_000) throw new Error("調整後庫存不足以涵蓋預留或占用，或超出上限。");
    if (stock) await tx.skuInventory.update({ where: { skuId: sku.id }, data: { onHand: after, version: { increment: 1 } } });
    else await tx.skuInventory.create({ data: { skuId: sku.id, onHand: after } });
    await tx.product.update({ where: { id: product.id }, data: { skuInventoryEnabled: true } });
    return tx.inventoryMovement.create({ data: { requestId: data.requestId, skuId: sku.id, actorId: actor, kind: data.kind,
      beforeOnHand: before, afterOnHand: after, reserved: stock?.reserved ?? 0, allocated: stock?.allocated ?? 0, reason: data.reason } });
  });
}
