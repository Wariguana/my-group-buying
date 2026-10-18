import "dotenv/config";
import { Client } from "pg";
import sharp from "sharp";
import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { E2eDatabaseLifecycle, deriveE2eControlDatabaseUrl } from "./lib/e2e-database";
import { resolvePostgresTool, runPostgresTool } from "./lib/postgres-tools";
const source = process.env.DATABASE_URL!;
const a = new E2eDatabaseLifecycle(source), b = new E2eDatabaseLifecycle(source);
const control = new Client({ connectionString: deriveE2eControlDatabaseUrl(source) });
const dir = mkdtempSync(join(tmpdir(), "qbuy-restore-"));
let first: Client | undefined, second: Client | undefined;
const start = Date.now();
try {
 await control.connect(); await a.createDatabase(control); await b.createDatabase(control);
 const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: a.targetDatabaseUrl }, stdio: "ignore", windowsHide: true });
 if (result.status !== 0) throw new Error("MIGRATION_FAILED");
 first = new Client({ connectionString: a.targetDatabaseUrl }); await first.connect();
 const owner = randomUUID(), checkout = randomUUID(), payment = randomUUID();
 // Synthetic bytea only; no private development screenshots are copied into test artifacts.
 const screenshot = await sharp({ create: { width: 4, height: 4, channels: 3, background: "white" } }).png().toBuffer(), hash = createHash("sha256").update(screenshot).digest("hex");
 await first.query(`INSERT INTO "CustomerAccount" (id,"lineUserId","lastLoginAt","updatedAt") VALUES ($1,$2,now(),now())`, [owner, "restore-" + owner]);
 await first.query(`INSERT INTO "Checkout" (id,"customerAccountId","requestId","requestHash","customerName","customerPhone",delivery,"bankSnapshot",subtotal,"shippingAmount","totalAmount","expiresAt") VALUES ($1,$2,$3,'restore','Synthetic','0900000000','{}','{}',100,60,160,now())`, [checkout,owner,randomUUID()]);
 await first.query(`INSERT INTO "Payment" (id,"checkoutId") VALUES ($1,$2)`, [payment,checkout]);
 await first.query(`INSERT INTO "BankTransferReport" ("paymentId","lastFive",screenshot,"mimeType",sha256) VALUES ($1,'00000',$2,'image/png',$3)`, [payment,screenshot,hash]);
 const dump = join(dir,"synthetic.dump"); runPostgresTool(resolvePostgresTool("pg_dump"), ["--format=custom","--file",dump,"--dbname",a.targetDatabaseUrl]);
 runPostgresTool(resolvePostgresTool("pg_restore"), ["--exit-on-error","--no-owner","--no-privileges","--dbname",b.targetDatabaseUrl,dump]);
 second = new Client({ connectionString:b.targetDatabaseUrl }); await second.connect();
 const row = (await second.query(`SELECT r.screenshot,r.sha256,c."totalAmount" FROM "BankTransferReport" r JOIN "Payment" p ON p.id=r."paymentId" JOIN "Checkout" c ON c.id=p."checkoutId" WHERE r."paymentId"=$1`,[payment])).rows[0];
 if (!row || row.totalAmount !== 160 || row.sha256 !== hash || !row.screenshot.equals(screenshot)) throw new Error("RESTORE_DATA_MISMATCH");
 if ((await sharp(row.screenshot).metadata()).width !== 4) throw new Error("RESTORED_IMAGE_UNREADABLE");
 console.log(JSON.stringify({ result:"PASSED", verification:"nonempty bytea SHA256, payment relation, checkout amount", elapsedMs:Date.now()-start }));
} catch { console.error("SCREENSHOT_RESTORE_FAILED"); process.exitCode=1; }
finally { await first?.end(); await second?.end(); if(a.canDropDatabase(a.targetDatabaseName))await a.dropDatabase(control); if(b.canDropDatabase(b.targetDatabaseName))await b.dropDatabase(control); await control.end(); rmSync(dir,{recursive:true,force:true}); }
