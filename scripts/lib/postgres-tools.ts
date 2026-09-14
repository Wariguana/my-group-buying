import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const POSTGRES_TOOLS = new Set(["pg_dump", "pg_restore", "psql"]);

export function requirePostgresDatabaseUrl(rawUrl: string | undefined): string {
  if (!rawUrl || rawUrl.trim() !== rawUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  try {
    const url = new URL(rawUrl);
    if (
      !["postgresql:", "postgres:"].includes(url.protocol)
      || !url.hostname
      || url.pathname === ""
      || url.pathname === "/"
      || url.hash !== ""
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  return rawUrl;
}

export function buildBackupFilename(now: Date): string {
  if (Number.isNaN(now.getTime())) throw new Error("Invalid backup timestamp.");
  return `my-group-buying-${now.toISOString().replaceAll(/[-:]/g, "").replace(".", "-")}.dump`;
}

export function parseBackupDestination(args: string[]): string | undefined {
  if (args.length === 0) return undefined;
  if (args.length !== 2 || args[0] !== "--destination" || !args[1]) {
    throw new Error("Usage: npm run db:backup -- --destination <directory>");
  }
  return args[1];
}

export function resolvePostgresTool(
  tool: "pg_dump" | "pg_restore" | "psql",
  environment: NodeJS.ProcessEnv = process.env,
): string {
  if (!POSTGRES_TOOLS.has(tool)) throw new Error("Unsupported PostgreSQL tool.");
  const executable = process.platform === "win32" ? `${tool}.exe` : tool;
  if (environment.POSTGRES_BIN) {
    const configured = path.join(environment.POSTGRES_BIN, executable);
    if (!existsSync(configured)) throw new Error(`PostgreSQL tool not found: ${tool}.`);
    return configured;
  }

  if (process.platform === "win32") {
    const root = "C:\\Program Files\\PostgreSQL";
    if (existsSync(root)) {
      const versions = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
      for (const version of versions) {
        const candidate = path.join(root, version, "bin", executable);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return executable;
}

export function runPostgresTool(
  executable: string,
  args: string[],
  options: { environment?: NodeJS.ProcessEnv } = {},
): void {
  const result = spawnSync(executable, args, {
    env: options.environment ?? process.env,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error("PostgreSQL command failed. Check the target, credentials, and tool output.");
  }
}

export function runPrismaMigrationStatus(databaseUrl: string): void {
  const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  if (!existsSync(prismaCli)) {
    throw new Error("Prisma CLI is not installed; run npm ci first.");
  }
  const result = spawnSync(process.execPath, [prismaCli, "migrate", "status"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error("Prisma migration status failed for the disposable restore database.");
  }
}
