// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Client } from "pg";
import { describe, expect, test } from "vitest";
import { validateE2eTargetDatabaseUrl } from "../../scripts/lib/e2e-database";
const enabled = process.env.SKU_INTEGRATION_TEST === "1";
if (enabled) validateE2eTargetDatabaseUrl(process.env.DATABASE_URL!);
(enabled ? describe : describe.skip)("Commerce additive migration on historical data", () => {
  test("preserves SKU UUID, null stock, order prices/names and Shipment snapshots; rerun deploy is external", async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const schema = `commerce_migration_${randomUUID().replaceAll("-", "")}`;
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      const root = new URL("../../prisma/migrations/", import.meta.url);
      const names = (await readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
      const current = "20261018090000_qbuy_commerce";
      for (const name of names.filter((n) => n < current)) await client.query(await readFile(new URL(`${name}/migration.sql`, root), "utf8"));
      const p = randomUUID(), g = randomUUID(), item = randomUUID(), customer = randomUUID(), order = randomUUID();
      await client.query(`INSERT INTO "Product" (id,name,"defaultPrice",cost,unit,"updatedAt") VALUES ($1,'Current product',999,50,'件',now())`, [p]);
      await client.query(`INSERT INTO "ProductSku" (id,"productId",code,"combinationKey","updatedAt") VALUES ($1,$1,$2,'default',now())`, [p, `DEFAULT-${p.toUpperCase()}`]);
      await client.query(`INSERT INTO "GroupBuy" (id,title,slug,"startAt","endAt","updatedAt") VALUES ($1,'Old group','legacy',now()-interval '2 days',now()-interval '1 day',now())`, [g]);
      await client.query(`INSERT INTO "GroupBuyItem" (id,"groupBuyId","productId","salePrice",cost,stock,"updatedAt") VALUES ($1,$2,$3,999,50,NULL,now())`, [item, g, p]);
      await client.query(`INSERT INTO "Customer" (id,phone) VALUES ($1,'0912345678')`, [customer]);
      await client.query(`INSERT INTO "Order" (id,"publicCode","orderNumber","groupBuyId","customerId",status,"fulfillmentMethod","customerName","customerPhone","sevenElevenStoreId","sevenElevenStoreName","sevenElevenStoreAddress","totalAmount","updatedAt") VALUES ($1,'ord-migration','202610180001',$2,$3,'PLACED','SEVEN_ELEVEN','Old customer','0912345678','123456','Old store','Old address',111,now())`, [order, g, customer]);
      await client.query(`INSERT INTO "OrderItem" (id,"orderId","groupBuyItemId","productName",unit,"unitPrice",quantity) VALUES ($1,$2,$3,'Old product name','件',111,1)`, [randomUUID(), order, item]);
      await client.query(`INSERT INTO "Shipment" (id,"orderId",provider,"trackingNumber","recipientName","recipientPhone","sevenElevenStoreId","sevenElevenStoreName","sevenElevenStoreAddress","updatedAt") VALUES ($1,$2,'SEVEN_ELEVEN_MYSHIP','MIGRATION-TEST','Old customer','0912345678','123456','Old store','Old address',now())`, [randomUUID(), order]);
      const snapshot = async () => {
        const result = [];
        for (const table of ["GroupBuyItem", "Order", "OrderItem", "Shipment"]) result.push((await client.query(`SELECT * FROM "${table}" ORDER BY id`)).rows);
        result.push((await client.query(`SELECT id,"productId",code,"combinationKey","isActive","createdAt","updatedAt" FROM "ProductSku"`)).rows);
        return result;
      };
      const before = await snapshot();
      await client.query(await readFile(new URL(`${current}/migration.sql`, root), "utf8"));
      expect(await snapshot()).toEqual(before);
      expect((await client.query(`SELECT "skuInventoryEnabled" FROM "Product"`)).rows[0].skuInventoryEnabled).toBe(false);
      expect((await client.query(`SELECT count(*)::int n FROM "SkuInventory"`)).rows[0].n).toBe(0);
      expect((await client.query(`SELECT "allowsCombinedShipping" FROM "GroupBuy"`)).rows[0].allowsCombinedShipping).toBe(true);
    } finally {
      await client.query("ROLLBACK"); await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA "${schema}" CASCADE`); await client.end();
    }
  });
});
