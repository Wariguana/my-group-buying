import "dotenv/config";

import { Client } from "pg";
import { validateE2eSourceDatabaseUrl, validateE2eTargetDatabaseUrl } from "./lib/e2e-database";
import { backfillDefaultProductSkus, inspectDefaultSkuMappings } from "./lib/product-sku-backfill";

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) {
    throw new Error("Usage: npm run sku:backfill -- [--apply]");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required.");
  // This tool intentionally refuses production. Future production backfill
  // needs a separately reviewed release procedure, not a bypass flag.
  try { validateE2eSourceDatabaseUrl(url); }
  catch { validateE2eTargetDatabaseUrl(url); }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const apply = args[0] === "--apply";
    await client.query(apply ? "BEGIN ISOLATION LEVEL SERIALIZABLE" : "BEGIN READ ONLY");
    const mappings = apply ? await backfillDefaultProductSkus(client) : await inspectDefaultSkuMappings(client);
    await client.query("COMMIT");
    console.log(JSON.stringify({ mode: apply ? "apply" : "report", mappings }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { await client.end(); }
}

try { await main(); }
catch {
  // Do not forward pg/Prisma errors or connection strings to operator logs.
  process.stderr.write("Default SKU mapping failed. Verify the approved local target, migration status and report; no partial backfill committed.\n");
  process.exitCode = 1;
}
