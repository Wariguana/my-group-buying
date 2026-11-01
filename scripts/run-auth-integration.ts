import "dotenv/config";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { deriveE2eControlDatabaseUrl, validateE2eSourceDatabaseUrl } from "./lib/e2e-database";

async function main() {
  const source = process.env.DATABASE_URL;
  if (process.argv.length !== 2 || !source) throw new Error("APPROVED_SOURCE_REQUIRED");
  validateE2eSourceDatabaseUrl(source);
  const bootstrap = `my_group_buying_test_bootstrap_${randomBytes(12).toString("hex")}`;
  const auth = `my_group_buying_test_auth_${randomBytes(12).toString("hex")}`;
  const target = (name: string) => { const u = new URL(source); u.pathname = `/${name}`; return u.toString(); };
  const control = new Client({ connectionString: deriveE2eControlDatabaseUrl(source) });
  let created = false;
  const run = (args: string[], url: string) => {
    const result = spawnSync(process.execPath, args, { env: { ...process.env, DATABASE_URL: url, TEST_DATABASE_URL: url }, stdio: "inherit", timeout: 120000, windowsHide: true });
    if (result.status !== 0) throw new Error("AUTH_INTEGRATION_CHILD_FAILED");
  };
  await control.connect();
  try {
    // Only this successful CREATE grants ownership for the matching final DROP.
    await control.query(`CREATE DATABASE "${bootstrap}"`); created = true;
    run(["node_modules/prisma/build/index.js", "migrate", "deploy"], target(bootstrap));
    run(["node_modules/vitest/vitest.mjs", "run", "tests/integration/bootstrap-concurrency.test.ts", "--maxWorkers=1"], target(bootstrap));
    // The auth suite independently CREATEs and DROPs this generated name.
    run(["node_modules/vitest/vitest.mjs", "run", "tests/integration/admin-login-session.test.ts", "--maxWorkers=1"], target(auth));
    const remaining = await control.query("SELECT 1 FROM pg_database WHERE datname=$1", [auth]);
    if (remaining.rowCount) throw new Error("AUTH_DATABASE_CLEANUP_FAILED");
  } finally {
    try { if (created) await control.query(`DROP DATABASE "${bootstrap}" WITH (FORCE)`); }
    finally { await control.end(); }
  }
}
try { await main(); }
catch { console.error("ISOLATED_AUTH_INTEGRATION_FAILED"); process.exitCode = 1; }
