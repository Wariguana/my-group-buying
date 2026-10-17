import type { Client } from "pg";
import { defaultSkuIdentity } from "../../src/lib/products/sku-validation";

export type DefaultSkuMapping = {
  productId: string;
  name: string;
  skuId: string;
  code: string;
  status: "mapped" | "ready" | "requires-review";
};

/** Caller owns the transaction and must validate the database target first. */
export async function inspectDefaultSkuMappings(client: Client): Promise<DefaultSkuMapping[]> {
  const result = await client.query<{
    id: string; name: string; skuId: string | null; code: string | null; hasOptions: boolean;
  }>(`
    SELECT p.id, p.name, s.id AS "skuId", s.code,
      (EXISTS (SELECT 1 FROM "ProductOption" o WHERE o."productId" = p.id)
       OR EXISTS (SELECT 1 FROM "ProductSku" v WHERE v."productId" = p.id AND v."combinationKey" <> 'default')) AS "hasOptions"
    FROM "Product" p LEFT JOIN "ProductSku" s
      ON s."productId" = p.id AND s."combinationKey" = 'default'
    ORDER BY p.id
  `);
  return result.rows.map((row) => {
    const identity = defaultSkuIdentity(row.id);
    const mapped = row.skuId === identity.id && row.code === identity.code;
    return {
      productId: row.id, name: row.name, skuId: identity.id, code: identity.code,
      status: mapped ? "mapped" : row.skuId || row.hasOptions ? "requires-review" : "ready",
    };
  });
}

/** No UPDATE: reruns cannot change an existing SKU ID, state or timestamps. */
export async function backfillDefaultProductSkus(client: Client): Promise<DefaultSkuMapping[]> {
  await client.query('SELECT id FROM "Product" ORDER BY id FOR UPDATE');
  const mappings = await inspectDefaultSkuMappings(client);
  if (mappings.some((mapping) => mapping.status === "requires-review")) {
    throw new Error("SKU mapping requires manual review; no backfill applied.");
  }
  for (const mapping of mappings) {
    if (mapping.status !== "ready") continue;
    await client.query(`
      INSERT INTO "ProductSku" (id, "productId", code, "combinationKey", "isActive", "updatedAt")
      SELECT id, id, $2, 'default', "isActive", CURRENT_TIMESTAMP FROM "Product" WHERE id = $1
      ON CONFLICT ("productId", "combinationKey") DO NOTHING
    `, [mapping.productId, mapping.code]);
  }
  return inspectDefaultSkuMappings(client);
}
