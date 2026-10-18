import "dotenv/config";
import { Client } from "pg";
import { validateE2eSourceDatabaseUrl } from "./lib/e2e-database";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || process.argv.length !== 2) throw new Error("Approved local DATABASE_URL required; no arguments accepted.");
  validateE2eSourceDatabaseUrl(url);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const rows = await client.query(`SELECT p.id, p.name,
      (SELECT count(*)::int FROM "ProductSku" s WHERE s."productId" = p.id) AS "skuCount",
      (SELECT coalesce(json_agg(json_build_object('groupBuyItemId', i.id, 'stock', i.stock)), '[]'::json) FROM "GroupBuyItem" i WHERE i."productId" = p.id) AS "legacyStockReferences",
      (SELECT count(*)::int FROM "OrderItem" oi JOIN "GroupBuyItem" i ON i.id = oi."groupBuyItemId" JOIN "Order" o ON o.id = oi."orderId"
        WHERE i."productId" = p.id AND o.status = 'PLACED' AND o."pickedUpAt" IS NULL) AS "unfulfilledLegacyLines"
      FROM "Product" p ORDER BY p.id`);
    await client.query("COMMIT");
    console.log(JSON.stringify({ mode: "dry-run", stockInferred: false, action: "Admin physical count required for every SKU; reconcile unfulfilled legacy orders before switch", products: rows.rows }, null, 2));
  } finally { await client.end(); }
}
main().catch(() => { console.error("Inventory inspection failed; no data changed. Verify approved local connection and migrations."); process.exitCode = 1; });
