import "dotenv/config";

import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import {
  buildBackupFilename,
  parseBackupDestination,
  requirePostgresDatabaseUrl,
  resolvePostgresTool,
  runPostgresTool,
} from "./lib/postgres-tools";

let outputPath: string | undefined;

try {
  const databaseUrl = requirePostgresDatabaseUrl(process.env.DATABASE_URL);
  const requestedDestination = parseBackupDestination(process.argv.slice(2));
  const destination = path.resolve(requestedDestination ?? "backups");
  mkdirSync(destination, { recursive: true });
  outputPath = path.join(destination, buildBackupFilename(new Date()));

  runPostgresTool(resolvePostgresTool("pg_dump"), [
    "--format=custom",
    "--file", outputPath,
    "--dbname", databaseUrl,
  ]);
  if (statSync(outputPath).size === 0) throw new Error("Backup file is empty.");
  runPostgresTool(resolvePostgresTool("pg_restore"), ["--list", outputPath]);
  process.stdout.write(`PostgreSQL backup written and structurally verified: ${outputPath}\n`);
} catch (error) {
  if (outputPath && existsSync(outputPath)) {
    try { unlinkSync(outputPath); } catch { /* Preserve the original safe failure. */ }
  }
  const message = error instanceof Error ? error.message : "PostgreSQL backup failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
