// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { validateE2eTargetDatabaseUrl } from "../../scripts/lib/e2e-database";
import { backfillDefaultProductSkus, inspectDefaultSkuMappings } from "../../scripts/lib/product-sku-backfill";
import { defaultSkuIdentity, skuCombinationKey } from "@/lib/products/sku-validation";

vi.mock("server-only", () => ({}));
const shouldRun = process.env.SKU_INTEGRATION_TEST === "1";
const databaseUrl = process.env.DATABASE_URL;
if (shouldRun) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  validateE2eTargetDatabaseUrl(databaseUrl);
}
const suite = shouldRun ? describe : describe.skip;

suite("SKU PostgreSQL foundation and legacy compatibility", () => {
  let db: ReturnType<typeof import("@/lib/db")["getDb"]>;
  let service: typeof import("@/lib/products/sku-service");
  beforeAll(async () => {
    db = (await import("@/lib/db")).getDb();
    service = await import("@/lib/products/sku-service");
  });
  afterAll(async () => { await db?.$disconnect(); });

  const code = () => `SKU-${randomUUID().toUpperCase()}`;
  async function product() {
    return db.product.create({ data: { name: "短袖上衣", unit: "件", defaultPrice: 150, cost: 90 } });
  }
  async function options(productId: string) {
    const color = await service.createProductOption(productId, "顏色");
    const size = await service.createProductOption(productId, "尺寸");
    return {
      color, size,
      black: await service.createProductOptionValue(productId, color.id, "黑"),
      white: await service.createProductOptionValue(productId, color.id, "白"),
      small: await service.createProductOptionValue(productId, size.id, "S"),
      medium: await service.createProductOptionValue(productId, size.id, "M"),
      large: await service.createProductOptionValue(productId, size.id, "L"),
    };
  }

  test("one Product has sparse multi-dimensional SKUs, without creating every combination", async () => {
    const p = await product();
    const o = await options(p.id);
    for (const ids of [[o.black.id, o.small.id], [o.black.id, o.medium.id], [o.white.id, o.large.id]]) {
      await service.createProductSku(p.id, { code: code(), optionValueIds: ids });
    }
    const rows = await db.productSku.findMany({ where: { productId: p.id }, include: { options: true } });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.options.length === 2)).toBe(true);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).defaultPrice).toBe(150);
  });

  test("global code and per-product combination uniqueness survive reordered choices", async () => {
    const p = await product(); const o = await options(p.id); const skuCode = code();
    await service.createProductSku(p.id, { code: skuCode, optionValueIds: [o.black.id, o.small.id] });
    await expect(service.createProductSku(p.id, { code: code(), optionValueIds: [o.small.id, o.black.id] })).rejects.toThrow();
    await expect(service.createProductSku(p.id, { code: skuCode, optionValueIds: [o.white.id, o.large.id] })).rejects.toThrow();
    const other = await product(); const otherOptions = await options(other.id);
    await expect(service.createProductSku(other.id, { code: skuCode, optionValueIds: [otherOptions.black.id] })).rejects.toThrow();
    expect(await db.productSku.count({ where: { productId: p.id } })).toBe(1);
  });

  test("different products may reuse dimension/value labels; IDs remain distinct", async () => {
    const p = await product(); const q = await product();
    const a = await options(p.id); const b = await options(q.id);
    const first = await service.createProductSku(p.id, { code: code(), optionValueIds: [a.black.id, a.small.id] });
    const second = await service.createProductSku(q.id, { code: code(), optionValueIds: [b.black.id, b.small.id] });
    expect(first.id).not.toBe(second.id);
    await expect(service.createProductOption(p.id, "顏色")).rejects.toThrow();
    await expect(service.createProductOptionValue(p.id, a.color.id, "黑")).rejects.toThrow();
  });

  test("service rejects cross-product selections and two values of the same dimension", async () => {
    const p = await product(); const q = await product(); const o = await options(p.id);
    await expect(service.createProductSku(q.id, { code: code(), optionValueIds: [o.black.id] })).rejects.toThrow();
    await expect(service.createProductSku(p.id, { code: code(), optionValueIds: [o.black.id, o.white.id] })).rejects.toThrow();
    expect(await db.productSku.count({ where: { productId: { in: [p.id, q.id] } } })).toBe(0);
  });

  test("direct SQL cannot forge a canonical key or bypass same-product composite foreign keys", async () => {
    const p = await product(); const q = await product(); const o = await options(p.id);
    await expect(db.productSku.create({ data: {
      productId: p.id, code: code(), combinationKey: o.black.id,
    } })).rejects.toThrow();
    await expect(db.productSku.create({ data: {
      productId: p.id, code: code(), combinationKey: "forged",
      options: { create: { optionId: o.color.id, optionValueId: o.black.id } },
    } })).rejects.toThrow();
    await expect(db.productSku.create({ data: {
      productId: q.id, code: code(), combinationKey: o.black.id,
      options: { create: { optionId: o.color.id, optionValueId: o.black.id } },
    } })).rejects.toThrow();
    await expect(db.productSku.create({ data: {
      productId: p.id, code: code(), combinationKey: skuCombinationKey([o.black.id, o.white.id]),
      options: { create: [o.black, o.white].map((value) => ({ optionId: value.optionId, optionValueId: value.id })) },
    } })).rejects.toThrow();
    expect(await db.productSku.count({ where: { productId: { in: [p.id, q.id] } } })).toBe(0);
  });

  test("deferred checks also protect direct option deletion and key mutation", async () => {
    const p = await product(); const o = await options(p.id);
    const sku = await service.createProductSku(p.id, { code: code(), optionValueIds: [o.black.id, o.small.id] });
    await expect(db.productSkuOptionValue.delete({ where: { skuId_optionId: { skuId: sku.id, optionId: o.color.id } } })).rejects.toThrow();
    await expect(db.productSku.update({ where: { id: sku.id }, data: { combinationKey: o.small.id } })).rejects.toThrow();
    expect(await db.productSkuOptionValue.count({ where: { skuId: sku.id } })).toBe(2);
  });

  test("database enforces concurrent duplicate combinations and concurrent duplicate codes", async () => {
    const p = await product(); const o = await options(p.id);
    const duplicate = await Promise.allSettled([1, 2].map(() =>
      service.createProductSku(p.id, { code: code(), optionValueIds: [o.black.id, o.small.id] })));
    expect(duplicate.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const sharedCode = code();
    const duplicateCode = await Promise.allSettled([[o.white.id, o.small.id], [o.white.id, o.medium.id]].map((ids) =>
      service.createProductSku(p.id, { code: sharedCode, optionValueIds: ids })));
    expect(duplicateCode.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  test("display renames preserve identity, while referenced dimensions and values cannot be deleted", async () => {
    const p = await product(); const o = await options(p.id);
    const sku = await service.createProductSku(p.id, { code: code(), optionValueIds: [o.black.id, o.small.id] });
    await db.productOption.update({ where: { id: o.color.id }, data: { name: "衣服顏色" } });
    await db.productOptionValue.update({ where: { id: o.black.id }, data: { value: "黑色" } });
    const after = await db.productSku.findUniqueOrThrow({ where: { id: sku.id } });
    expect(after).toEqual(sku);
    await expect(db.productOptionValue.delete({ where: { id: o.black.id } })).rejects.toThrow();
    await expect(db.productOption.delete({ where: { id: o.color.id } })).rejects.toThrow();
    // A value ID is stable: cascading a changed ID without updating the key fails.
    await expect(db.productOptionValue.update({ where: { id: o.black.id }, data: { id: randomUUID() } })).rejects.toThrow();
    expect(await db.productSkuOptionValue.count({ where: { skuId: sku.id } })).toBe(2);
  });

  test("link UPDATE cannot bypass the trigger, and an atomic valid edit succeeds at commit", async () => {
    const p = await product(); const o = await options(p.id);
    const sku = await service.createProductSku(p.id, { code: code(), optionValueIds: [o.black.id, o.small.id] });
    const where = { skuId_optionId: { skuId: sku.id, optionId: o.color.id } };
    await expect(db.productSkuOptionValue.update({ where, data: { optionValueId: o.white.id } })).rejects.toThrow();
    await db.$transaction(async (tx) => {
      await tx.productSkuOptionValue.update({ where, data: { optionValueId: o.white.id } });
      await tx.productSku.update({ where: { id: sku.id }, data: { combinationKey: skuCombinationKey([o.white.id, o.small.id]) } });
    });
    expect((await db.productSku.findUniqueOrThrow({ where: { id: sku.id } })).combinationKey).toBe(skuCombinationKey([o.white.id, o.small.id]));
    // Removing a dimension is valid only when its canonical key changes too.
    await db.$transaction(async (tx) => {
      await tx.productSkuOptionValue.delete({ where });
      await tx.productSku.update({ where: { id: sku.id }, data: { combinationKey: o.small.id } });
    });
    expect(await db.productSkuOptionValue.count({ where: { skuId: sku.id } })).toBe(1);
    // Deleting an unreferenced SKU intentionally cascades its selections.
    await db.productSku.delete({ where: { id: sku.id } });
    expect(await db.productSkuOptionValue.count({ where: { skuId: sku.id } })).toBe(0);
  });

  test("a synthetic UUID collision is rejected without overwriting the existing SKU", async () => {
    const p = await product(); const q = await product(); const o = await options(p.id);
    const existing = await db.productSku.create({ data: {
      id: q.id, productId: p.id, code: code(), combinationKey: o.black.id,
      options: { create: { optionId: o.color.id, optionValueId: o.black.id } },
    } });
    await expect(service.ensureDefaultProductSku(q.id)).rejects.toThrow();
    expect(await db.productSku.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing);
    expect(await db.productSku.count({ where: { productId: q.id } })).toBe(0);
  });

  test("default mapping is concurrent-safe, stable on rerun and preserves activation/timestamps", async () => {
    const p = await product();
    const mapped = await Promise.all([service.ensureDefaultProductSku(p.id), service.ensureDefaultProductSku(p.id)]);
    expect(mapped[0].id).toBe(p.id); expect(mapped[1].id).toBe(p.id);
    await service.setProductSkuActive(p.id, false);
    const before = await db.productSku.findUniqueOrThrow({ where: { id: p.id } });
    expect(await service.ensureDefaultProductSku(p.id)).toEqual(before);
    expect(await db.productSku.count({ where: { productId: p.id } })).toBe(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).isActive).toBe(true);
  });

  test("SKU deactivation preserves selected values, old order snapshots and the legacy purchase path", async () => {
    const p = await product(); const sku = await service.ensureDefaultProductSku(p.id);
    const o = await options(p.id);
    const variant = await service.createProductSku(p.id, { code: code(), optionValueIds: [o.black.id, o.small.id] });
    const suffix = randomUUID().replaceAll("-", "");
    const location = await db.pickupLocation.create({ data: { name: "Legacy pickup", address: "Original address" } });
    const group = await db.groupBuy.create({ data: {
      title: "Legacy", slug: `gb-${suffix.slice(0, 16)}`, status: "PUBLISHED",
      startAt: new Date(Date.now() - 60_000), endAt: new Date(Date.now() + 3_600_000),
      items: { create: { productId: p.id, salePrice: 120, cost: 80, stock: 5 } },
      pickups: { create: { pickupLocationId: location.id } },
    }, include: { items: true, pickups: true } });
    const { createOrder } = await import("@/lib/orders/service");
    const { getOrderForAccess } = await import("@/lib/orders/access-service");
    const input = { customerName: "SKU compatibility", customerPhone: "0912345678", fulfillmentMethod: "SELF_PICKUP",
      groupBuyPickupId: group.pickups[0].id,
      items: [{ groupBuyItemId: group.items[0].id, quantity: 1, expectedUnitPrice: 120 }] };
    const first = await createOrder(group.slug, input);
    const before = await getOrderForAccess(first.publicCode, { accessToken: first.accessToken });
    await service.setProductSkuActive(sku.id, false);
    await service.setProductSkuActive(variant.id, false);
    expect(await db.productSkuOptionValue.count({ where: { skuId: variant.id } })).toBe(2);
    expect(await getOrderForAccess(first.publicCode, { accessToken: first.accessToken })).toEqual(before);
    expect((await createOrder(group.slug, input)).totalAmount).toBe(120);
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: group.items[0].id } })).stock).toBe(3);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).defaultPrice).toBe(150);
    expect((await db.productSku.findUniqueOrThrow({ where: { id: sku.id } })).isActive).toBe(false);
  });

  test("expand migration and rerunnable backfill preserve all legacy rows and null stock", async () => {
    const client = new Client({ connectionString: databaseUrl }); await client.connect();
    const schema = `sku_migration_${randomUUID().replaceAll("-", "")}`;
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      const root = new URL("../../prisma/migrations/", import.meta.url);
      const directories = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
      const current = "20261017090000_add_product_sku_foundation";
      for (const directory of directories.filter((name) => name < current)) {
        await client.query(await readFile(new URL(`${directory}/migration.sql`, root), "utf8"));
      }
      const productId = randomUUID(); const groupId = randomUUID(); const itemId = randomUUID();
      const customerId = randomUUID(); const pickupId = randomUUID(); const groupPickupId = randomUUID(); const orderId = randomUUID();
      await client.query(`INSERT INTO "Product" (id,name,"defaultPrice",cost,unit,"updatedAt") VALUES ($1,'Legacy',150,90,'件',now())`, [productId]);
      await client.query(`INSERT INTO "GroupBuy" (id,title,slug,"startAt","endAt","updatedAt") VALUES ($1,'Legacy','legacy',now(),now()+interval '1 day',now())`, [groupId]);
      await client.query(`INSERT INTO "GroupBuyItem" (id,"groupBuyId","productId","salePrice",cost,stock,"updatedAt") VALUES ($1,$2,$3,120,80,NULL,now())`, [itemId, groupId, productId]);
      await client.query(`INSERT INTO "Customer" (id,phone) VALUES ($1,'0912345678')`, [customerId]);
      await client.query(`INSERT INTO "PickupLocation" (id,name,address,"updatedAt") VALUES ($1,'Pickup','Address',now())`, [pickupId]);
      await client.query(`INSERT INTO "GroupBuyPickup" (id,"groupBuyId","pickupLocationId","updatedAt") VALUES ($1,$2,$3,now())`, [groupPickupId, groupId, pickupId]);
      await client.query(`INSERT INTO "Order" (id,"publicCode","orderNumber","groupBuyId","customerId","groupBuyPickupId",status,"customerName","customerPhone","pickupName","pickupAddress","totalAmount","updatedAt") VALUES ($1,'ord-migration','202610170001',$2,$3,$4,'PLACED','Customer','0912345678','Pickup','Address',120,now())`, [orderId, groupId, customerId, groupPickupId]);
      await client.query(`INSERT INTO "OrderItem" (id,"orderId","groupBuyItemId","productName",unit,"unitPrice",quantity) VALUES ($1,$2,$3,'Original','件',120,1)`, [randomUUID(), orderId, itemId]);
      const snapshot = async () => {
        const rows: unknown[] = [];
        for (const table of ["Product", "GroupBuy", "GroupBuyItem", "Order", "OrderItem"]) {
          rows.push((await client.query(`SELECT * FROM "${table}" ORDER BY id`)).rows);
        }
        return rows;
      };
      const before = await snapshot();
      await client.query(await readFile(new URL(`${current}/migration.sql`, root), "utf8"));
      expect(await snapshot()).toEqual(before);
      expect(await inspectDefaultSkuMappings(client)).toEqual([{ productId, name: "Legacy", skuId: productId, code: defaultSkuIdentity(productId).code, status: "ready" }]);
      for (let run = 0; run < 2; run++) {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        await backfillDefaultProductSkus(client); await client.query("COMMIT");
      }
      const mapped = (await client.query('SELECT * FROM "ProductSku"')).rows;
      expect(mapped).toHaveLength(1); expect(mapped[0].id).toBe(productId);
      await client.query("BEGIN"); await backfillDefaultProductSkus(client); await client.query("COMMIT");
      expect((await client.query('SELECT * FROM "ProductSku"')).rows).toEqual(mapped);
      expect(await snapshot()).toEqual(before);
      // The report must stop applying guesses once real variant metadata exists.
      await client.query(`INSERT INTO "ProductOption" (id,"productId",name) VALUES ($1,$2,'Size')`, [randomUUID(), productId]);
      await client.query('DELETE FROM "ProductSku"');
      expect((await inspectDefaultSkuMappings(client))[0].status).toBe("requires-review");
      await client.query("BEGIN");
      await expect(backfillDefaultProductSkus(client)).rejects.toThrow("manual review");
      await client.query("ROLLBACK");
      expect((await client.query('SELECT count(*)::int count FROM "ProductSku"')).rows[0].count).toBe(0);
    } finally {
      await client.query("ROLLBACK");
      await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    }
  });
});
