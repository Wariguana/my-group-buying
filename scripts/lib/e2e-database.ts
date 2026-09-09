import { randomBytes } from "node:crypto";

const E2E_DATABASE_PREFIX = "my_group_buying_e2e_";
const E2E_DATABASE_SUFFIX_LENGTH = 32;
const POSTGRES_IDENTIFIER_MAX_LENGTH = 63;

const APPROVED_SOURCES = [
  { environment: "local", port: 5433, database: "my_group_buying_dev" },
  { environment: "ci", port: 5432, database: "ci" },
] as const;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const E2E_DATABASE_NAME_PATTERN = new RegExp(
  `^${E2E_DATABASE_PREFIX}[a-f0-9]{${E2E_DATABASE_SUFFIX_LENGTH}}$`,
);

export type E2eSourceEnvironment = (typeof APPROVED_SOURCES)[number]["environment"];

export type E2eSourceDatabase = Readonly<{
  environment: E2eSourceEnvironment;
  protocol: "postgres:" | "postgresql:";
  hostname: string;
  port: number;
  database: "my_group_buying_dev" | "ci";
}>;

export type DatabaseQueryResult = Readonly<{
  rowCount: number | null;
}>;

export interface E2eDatabaseControl {
  query(sql: string, values?: unknown[]): Promise<DatabaseQueryResult>;
}

function parseApprovedSource(rawSourceUrl: string): {
  url: URL;
  metadata: E2eSourceDatabase;
} {
  try {
    if (
      rawSourceUrl.trim() !== rawSourceUrl ||
      rawSourceUrl.includes("?") ||
      rawSourceUrl.includes("#")
    ) {
      throw new Error();
    }

    const url = new URL(rawSourceUrl);
    if (
      (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
      !LOOPBACK_HOSTS.has(url.hostname) ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      throw new Error();
    }

    const source = APPROVED_SOURCES.find(
      (candidate) =>
        url.port === String(candidate.port) &&
        url.pathname === `/${candidate.database}`,
    );
    if (!source) throw new Error();

    return {
      url,
      metadata: Object.freeze({
        environment: source.environment,
        protocol: url.protocol,
        hostname: url.hostname,
        port: source.port,
        database: source.database,
      }),
    };
  } catch {
    throw new Error(
      "DATABASE_URL must target the approved loopback-only local or CI PostgreSQL source database.",
    );
  }
}

/** Validate a source URL and return connection metadata with no credentials. */
export function validateE2eSourceDatabaseUrl(rawSourceUrl: string): E2eSourceDatabase {
  return parseApprovedSource(rawSourceUrl).metadata;
}

export function isValidE2eDatabaseName(databaseName: string): boolean {
  return (
    databaseName.length <= POSTGRES_IDENTIFIER_MAX_LENGTH &&
    E2E_DATABASE_NAME_PATTERN.test(databaseName)
  );
}

export function generateE2eDatabaseName(): string {
  const databaseName = `${E2E_DATABASE_PREFIX}${randomBytes(16).toString("hex")}`;
  if (!isValidE2eDatabaseName(databaseName)) {
    throw new Error("Failed to generate a safe E2E database name.");
  }
  return databaseName;
}

/** Derive the target connection URL without changing source connection details. */
export function deriveE2eDatabaseUrl(
  rawSourceUrl: string,
  targetDatabaseName: string,
): string {
  const { url } = parseApprovedSource(rawSourceUrl);
  if (!isValidE2eDatabaseName(targetDatabaseName)) {
    throw new Error("Invalid E2E database name.");
  }

  url.pathname = `/${targetDatabaseName}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

/** Derive a control connection URL after validating the approved source. */
export function deriveE2eControlDatabaseUrl(rawSourceUrl: string): string {
  const { url } = parseApprovedSource(rawSourceUrl);
  url.pathname = "/postgres";
  url.search = "";
  url.hash = "";
  return url.toString();
}

/** Validate that a child process received an isolated target URL. */
export function validateE2eTargetDatabaseUrl(rawTargetUrl: string): void {
  try {
    if (
      rawTargetUrl.trim() !== rawTargetUrl ||
      rawTargetUrl.includes("?") ||
      rawTargetUrl.includes("#")
    ) {
      throw new Error();
    }

    const targetUrl = new URL(rawTargetUrl);
    const targetDatabaseName = decodeURIComponent(targetUrl.pathname.slice(1));
    if (!isValidE2eDatabaseName(targetDatabaseName)) throw new Error();

    const source = APPROVED_SOURCES.find(
      (candidate) => targetUrl.port === String(candidate.port),
    );
    if (!source) throw new Error();

    const sourceUrl = new URL(targetUrl);
    sourceUrl.pathname = `/${source.database}`;
    parseApprovedSource(sourceUrl.toString());
  } catch {
    throw new Error("DATABASE_URL must target an isolated E2E database.");
  }
}

function quoteValidatedDatabaseIdentifier(databaseName: string): string {
  if (!isValidE2eDatabaseName(databaseName)) {
    throw new Error("Invalid E2E database name.");
  }
  return `"${databaseName}"`;
}

/**
 * Owns one generated target name and permits cleanup only after this instance
 * successfully created that exact database.
 */
export class E2eDatabaseLifecycle {
  readonly source: E2eSourceDatabase;
  readonly targetDatabaseName: string;

  private readonly rawSourceUrl: string;
  private createdDatabaseName: string | undefined;

  constructor(rawSourceUrl: string) {
    this.source = validateE2eSourceDatabaseUrl(rawSourceUrl);
    this.rawSourceUrl = rawSourceUrl;
    this.targetDatabaseName = generateE2eDatabaseName();
  }

  get targetDatabaseUrl(): string {
    return deriveE2eDatabaseUrl(this.rawSourceUrl, this.targetDatabaseName);
  }

  canDropDatabase(databaseName: string): boolean {
    return (
      isValidE2eDatabaseName(databaseName) &&
      databaseName !== this.source.database &&
      this.createdDatabaseName === databaseName
    );
  }

  async createDatabase(control: E2eDatabaseControl): Promise<void> {
    const databaseName = this.targetDatabaseName;
    const existing = await control.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName],
    );
    if (existing.rowCount !== 0) {
      throw new Error("Generated E2E database already exists; refusing to reuse it.");
    }

    await control.query(
      `CREATE DATABASE ${quoteValidatedDatabaseIdentifier(databaseName)}`,
    );
    this.createdDatabaseName = databaseName;
  }

  async dropDatabase(
    control: E2eDatabaseControl,
    databaseName = this.targetDatabaseName,
  ): Promise<void> {
    if (!this.canDropDatabase(databaseName)) {
      throw new Error("Refusing to drop an E2E database not owned by this lifecycle.");
    }

    await control.query(
      `DROP DATABASE ${quoteValidatedDatabaseIdentifier(databaseName)} WITH (FORCE)`,
    );
    this.createdDatabaseName = undefined;

    const remaining = await control.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName],
    );
    if (remaining.rowCount !== 0) {
      throw new Error("E2E database cleanup verification failed.");
    }
  }
}
