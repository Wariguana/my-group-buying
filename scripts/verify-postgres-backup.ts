import "dotenv/config";

import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import {
  deriveE2eControlDatabaseUrl,
  E2eDatabaseLifecycle,
} from "./lib/e2e-database";
import {
  requirePostgresDatabaseUrl,
  resolvePostgresTool,
  runPrismaMigrationStatus,
  runPostgresTool,
} from "./lib/postgres-tools";

async function main(): Promise<void> {
  if (process.argv.length !== 3) {
    throw new Error("Usage: npm run db:backup:verify -- <backup-file>");
  }
  const backupPath = path.resolve(process.argv[2]);
  if (!existsSync(backupPath) || !statSync(backupPath).isFile()) {
    throw new Error("Backup file does not exist.");
  }

  const sourceUrl = requirePostgresDatabaseUrl(process.env.DATABASE_URL);
  const lifecycle = new E2eDatabaseLifecycle(sourceUrl);
  const control = new Pool({
    connectionString: deriveE2eControlDatabaseUrl(sourceUrl),
  });
  let created = false;

  try {
    await lifecycle.createDatabase(control);
    created = true;
    runPostgresTool(resolvePostgresTool("pg_restore"), [
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      "--dbname", lifecycle.targetDatabaseUrl,
      backupPath,
    ]);
    runPrismaMigrationStatus(lifecycle.targetDatabaseUrl);

    const restored = new Pool({ connectionString: lifecycle.targetDatabaseUrl });
    try {
      const migrations = await restored.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
      );
      const orders = await restored.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM "Order"');
      const users = await restored.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM "User"');
      process.stdout.write(
        `Disposable restore and Prisma status verified: migrations=${migrations.rows[0].count}, orders=${orders.rows[0].count}, users=${users.rows[0].count}.\n`,
      );
    } finally {
      await restored.end();
    }
  } finally {
    if (created) {
      await lifecycle.dropDatabase(control);
      process.stdout.write("Disposable restore database removed.\n");
    }
    await control.end();
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Backup restore verification failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
