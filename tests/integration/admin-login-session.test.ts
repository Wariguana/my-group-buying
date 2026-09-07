// @vitest-environment node
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const prefix = "my_group_buying_test_auth_";
const rawTestUrl = process.env.TEST_DATABASE_URL;
const originalDatabaseUrl = process.env.DATABASE_URL;
const integrationSuite = rawTestUrl ? describe : describe.skip;

function requireSafeTestDatabaseUrl(raw: string): URL {
  try {
    const url = new URL(raw);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433" ||
      !new RegExp(`^${prefix}[a-z0-9_]+$`).test(database) || database.length > 63 ||
      url.search !== "" || url.hash !== "" || raw.includes("?") || raw.includes("#")
    ) throw new Error();
    return url;
  } catch {
    throw new Error("TEST_DATABASE_URL must target a disposable local PostgreSQL auth database on port 5433, without query or fragment.");
  }
}

describe("auth integration database safety guard", () => {
  test.each(["postgres", "postgresql"])("accepts %s at loopback", (protocol) => {
    for (const hostname of ["localhost", "127.0.0.1"]) {
      expect(requireSafeTestDatabaseUrl(`${protocol}://${hostname}:5433/${prefix}safe`).hostname).toBe(hostname);
    }
  });
  test.each([
    "not a URL",
    `http://localhost:5433/${prefix}safe`,
    `postgres://example.com:5433/${prefix}safe`,
    `postgres://localhost:5432/${prefix}safe`,
    "postgres://localhost:5433/my_group_buying_dev",
    "postgres://localhost:5433/my_group_buying_test_bootstrap_safe",
    `postgres://localhost:5433/${prefix}safe?schema=public`,
    `postgres://localhost:5433/${prefix}safe#fragment`,
    `postgres://localhost:5433/${prefix}safe?`,
    `postgres://localhost:5433/${prefix}safe#`,
    `postgres://localhost:5433/${prefix}unsafe%22`,
    `postgres://localhost:5433/${prefix}${"a".repeat(64)}`,
  ])("rejects unsafe target without connecting case %#", (url) => {
    expect(() => requireSafeTestDatabaseUrl(url)).toThrow("TEST_DATABASE_URL must target");
  });
});

integrationSuite("admin login and session PostgreSQL persistence", () => {
  let control: Client | undefined;
  let database: string | undefined;
  let created = false;
  let db: ReturnType<typeof import("@/lib/db").getDb> | undefined;

  beforeAll(async () => {
    // No development fallback. Validate before importing the production DB boundary.
    const url = requireSafeTestDatabaseUrl(rawTestUrl!);
    database = decodeURIComponent(url.pathname.slice(1));
    process.env.DATABASE_URL = url.toString();
    const controlUrl = new URL(url);
    controlUrl.pathname = "/postgres";
    control = new Client({ connectionString: controlUrl.toString() });
    try {
      await control.connect();
      // CREATE fails if this name already exists; never reuse/drop someone else's DB.
      await control.query(`CREATE DATABASE "${database}"`);
      created = true;
      execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
        env: { ...process.env, DATABASE_URL: url.toString() },
        stdio: "pipe", timeout: 60000,
      });
      const { getDb } = await import("@/lib/db");
      db = getDb();
    } catch {
      throw new Error("Disposable auth database setup failed.");
    }
  }, 90000);

  afterAll(async () => {
    let cleanupFailed = false;
    try {
      try { await db?.$disconnect(); } catch { cleanupFailed = true; }
      if (created && control && database) {
        try {
          await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);
          const remaining = await control.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
          if (remaining.rowCount !== 0) cleanupFailed = true;
        } catch { cleanupFailed = true; }
      }
    } finally {
      try { await control?.end(); } catch { cleanupFailed = true; }
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
    if (cleanupFailed) throw new Error("Disposable auth database cleanup failed.");
  }, 30000);

  test("persists hashed session, immediately observes inactive/expired state, and revokes", async () => {
    try {
      const [{ createFirstAdmin }, { authenticateAdminCredentials }, sessions, { hashSessionToken }] = await Promise.all([
        import("@/lib/auth/bootstrap-admin"), import("@/lib/auth/credentials"),
        import("@/lib/auth/session"), import("@/lib/auth/session-token"),
      ]);
      const input = { email: `admin-${randomBytes(8).toString("hex")}@example.com`, password: randomBytes(24).toString("base64url") };
      const admin = await createFirstAdmin(input);
      expect(await authenticateAdminCredentials(input)).toEqual(admin);
      expect(await authenticateAdminCredentials({ ...input, password: randomBytes(24).toString("hex") })).toBeNull();
      const before = Date.now();
      const session = await sessions.createAdminSession(admin.id);
      const after = Date.now();
      expect(await db!.session.count()).toBe(1);
      const persisted = await db!.session.findFirstOrThrow({ select: { tokenHash: true, expiresAt: true } });
      // Compare secrets as booleans, so assertion failures cannot print them.
      expect(persisted.tokenHash !== session.token).toBe(true);
      expect(persisted.tokenHash === hashSessionToken(session.token)).toBe(true);
      expect(persisted.expiresAt.getTime()).toBe(session.expiresAt.getTime());
      expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 604800000);
      expect(session.expiresAt.getTime()).toBeLessThanOrEqual(after + 604800000);
      expect(await sessions.getAdminBySessionToken(session.token)).toEqual(admin);
      await db!.user.update({ where: { id: admin.id }, data: { isActive: false }, select: { id: true } });
      expect(await sessions.getAdminBySessionToken(session.token)).toBeNull();
      await db!.user.update({ where: { id: admin.id }, data: { isActive: true }, select: { id: true } });
      expect(await sessions.getAdminBySessionToken(session.token)).toEqual(admin);
      await db!.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1) } });
      expect(await sessions.getAdminBySessionToken(session.token)).toBeNull();
      await sessions.revokeAdminSession(session.token);
      await sessions.revokeAdminSession(session.token);
      expect(await db!.session.count()).toBe(0);
      expect(await sessions.getAdminBySessionToken(session.token)).toBeNull();
    } catch {
      // Driver errors can contain test secrets; never emit them to the reporter.
      throw new Error("Isolated admin login/session integration assertion failed.");
    }
  }, 30000);
});
