import "dotenv/config";
import { Pool } from "pg";
import { spawnSync } from "node:child_process";
import { E2eDatabaseLifecycle, deriveE2eControlDatabaseUrl } from "./lib/e2e-database";
import { resolvePostgresTool, runPostgresTool } from "./lib/postgres-tools";
const source = process.env.DATABASE_URL!;
const lifecycle = new E2eDatabaseLifecycle(source);
const control = new Pool({connectionString: deriveE2eControlDatabaseUrl(source)});
const original = new Pool({connectionString: source});
const backup = process.argv[2];
if(!backup || process.argv.length > 4 || (process.argv[3] && process.argv[3] !== "--apply-development")) throw new Error("Usage: verify-qbuy-migration.ts <backup> [--apply-development]");
function prisma(url: string, args: string[]) {
 const r = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], {env:{...process.env,DATABASE_URL:url},stdio:"inherit",windowsHide:true});
 if(r.status !== 0) throw new Error("Prisma validation failed");
}
async function fingerprint(pool: Pool, tables: {name:string, columns:string[]}[]) {
 const results: Record<string, unknown> = {};
 for (const t of tables) {
  const quote = (s:string) => '"'+s.replaceAll('"','""')+'"';
  const r=await pool.query(`SELECT count(*)::text AS count, md5(coalesce(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text),'')) AS hash FROM (SELECT ${t.columns.map(quote).join(',')} FROM ${quote(t.name)}) t`);
  results[t.name]=r.rows[0];
 }
 return results;
}
try {
 const columns=await original.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations' ORDER BY table_name, ordinal_position`);
 const tables: {name:string,columns:string[]}[]=[];
 for(const r of columns.rows) { let t=tables.find(t=>t.name===r.table_name); if(!t){t={name:r.table_name,columns:[]};tables.push(t);}t.columns.push(r.column_name); }
 const before=await fingerprint(original,tables);
 await lifecycle.createDatabase(control);
 runPostgresTool(resolvePostgresTool("pg_restore"),["--exit-on-error","--no-owner","--no-privileges","--dbname",lifecycle.targetDatabaseUrl,backup]);
 const restored=new Pool({connectionString:lifecycle.targetDatabaseUrl});
 try {
  if(JSON.stringify(before)!==JSON.stringify(await fingerprint(restored,tables)))throw new Error("Backup contents differ from source; stop");
  prisma(lifecycle.targetDatabaseUrl,["migrate","deploy"]);
  prisma(lifecycle.targetDatabaseUrl,["migrate","status"]);
  prisma(lifecycle.targetDatabaseUrl,["migrate","diff","--from-config-datasource","--to-schema","prisma/schema.prisma","--exit-code"]);
  if(JSON.stringify(before)!==JSON.stringify(await fingerprint(restored,tables)))throw new Error("Historical rows changed during migration");
  console.log("RESTORE + MIGRATION VERIFIED",JSON.stringify(before));
  if(process.argv.includes("--apply-development")) {
   if(JSON.stringify(before)!==JSON.stringify(await fingerprint(original,tables)))throw new Error("Source changed; stop");
   prisma(source,["migrate","deploy"]);
   prisma(source,["migrate","status"]);
   prisma(source,["migrate","diff","--from-config-datasource","--to-schema","prisma/schema.prisma","--exit-code"]);
   if(JSON.stringify(before)!==JSON.stringify(await fingerprint(original,tables)))throw new Error("Development history mismatch");
   console.log("DEVELOPMENT VERIFIED: all original row fingerprints unchanged");
  }
 } finally {await restored.end();}
} finally {await original.end();if(lifecycle.canDropDatabase(lifecycle.targetDatabaseName))await lifecycle.dropDatabase(control);await control.end();}
