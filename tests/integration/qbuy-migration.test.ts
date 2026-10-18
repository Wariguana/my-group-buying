// @vitest-environment node
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {Client} from "pg";
import {describe,test,expect} from "vitest";
import {validateE2eTargetDatabaseUrl} from "../../scripts/lib/e2e-database";
const enabled=process.env.SKU_INTEGRATION_TEST==="1";if(enabled)validateE2eTargetDatabaseUrl(process.env.DATABASE_URL!);
(enabled?describe:describe.skip)("QB historical migration",()=>{
 test("all 20 prior migrations with historical settled refund and outbox preserve original columns",async()=>{
  const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();const schema=`m3_migration_${randomUUID().replaceAll("-","")}`;
  try{await client.query(`CREATE SCHEMA "${schema}"`);await client.query(`SET search_path TO "${schema}"`);const root=new URL("../../prisma/migrations/",import.meta.url),current="20261018180000_qbuy_lifecycle";const names=(await readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name).sort();for(const name of names.filter(n=>n<current))await client.query(await readFile(new URL(`${name}/migration.sql`,root),"utf8"));
   const owner=randomUUID(),checkout=randomUUID(),refund=randomUUID(),outbox=randomUUID();await client.query(`INSERT INTO "CustomerAccount" (id,"lineUserId","lastLoginAt","updatedAt") VALUES ($1,'historical',now(),now())`,[owner]);await client.query(`INSERT INTO "Checkout" (id,"customerAccountId","requestId","requestHash","customerName","customerPhone",delivery,"bankSnapshot",subtotal,"shippingAmount","totalAmount","expiresAt") VALUES ($1,$2,$3,'history','History','0912345678','{}','{}',750,0,750,now())`,[checkout,owner,randomUUID()]);await client.query(`INSERT INTO "RefundObligation" (id,"checkoutId",reason,amount,status) VALUES ($1,$2,'OVERPAYMENT',30,'REFUNDED')`,[refund,checkout]);await client.query(`INSERT INTO "CheckoutOutbox" (id,"checkoutId",event,payload,"deliveredAt") VALUES ($1,$2,'FINALIZED','{"old":true}',now())`,[outbox,checkout]);
   const beforeRefund=(await client.query(`SELECT id,"checkoutId",reason,amount,status,"createdAt" FROM "RefundObligation"`)).rows;const beforeOutbox=(await client.query(`SELECT id,"checkoutId",event,payload,"createdAt","deliveredAt" FROM "CheckoutOutbox"`)).rows;
   await client.query(await readFile(new URL(`${current}/migration.sql`,root),"utf8"));expect((await client.query(`SELECT id,"checkoutId",reason,amount,status,"createdAt" FROM "RefundObligation"`)).rows).toEqual(beforeRefund);expect((await client.query(`SELECT id,"checkoutId",event,payload,"createdAt","deliveredAt" FROM "CheckoutOutbox"`)).rows).toEqual(beforeOutbox);
   expect((await client.query(`SELECT "eventKey" FROM "RefundObligation"`)).rows[0].eventKey).toBe(`legacy:${refund}`);await client.query(`INSERT INTO "RefundObligation" (id,"checkoutId",reason,amount,"eventKey") VALUES ($1,$2,'OVERPAYMENT',10,'new-receipt')`,[randomUUID(),checkout]);expect((await client.query(`SELECT count(*)::int n FROM "RefundObligation"`)).rows[0].n).toBe(2);
  }finally{await client.query("ROLLBACK");await client.query("SET search_path TO public");await client.query(`DROP SCHEMA "${schema}" CASCADE`);await client.end();}
 });
});
