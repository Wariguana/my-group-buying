// @vitest-environment node

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const TEST_DATABASE_PREFIX = "my_group_buying_test_bootstrap_";
const DEVELOPMENT_DATABASE = "my_group_buying_dev";
const rawTestDatabaseUrl = process.env.TEST_DATABASE_URL;
const originalDatabaseUrl = process.env.DATABASE_URL;
const integrationSuite = rawTestDatabaseUrl ? describe : describe.skip;

function requireSafeTestDatabaseUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const database = decodeURIComponent(url.pathname.slice(1));

  if (
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.port !== "5433" ||
    !database.startsWith(TEST_DATABASE_PREFIX) ||
    database === DEVELOPMENT_DATABASE
  ) {
    throw new Error(
      "TEST_DATABASE_URL must use PostgreSQL and target a disposable localhost:5433 bootstrap test database.",
    );
  }

  return rawUrl;
}

describe("TEST_DATABASE_URL safety guard", () => {
  test.each(["postgresql:", "postgres:"])("accepts the %s protocol", (protocol) => {
    const url = `${protocol}//localhost:5433/${TEST_DATABASE_PREFIX}safe`;

    expect(requireSafeTestDatabaseUrl(url)).toBe(url);
  });

  test.each([
    ["HTTP protocol", `http://localhost:5433/${TEST_DATABASE_PREFIX}safe`],
    ["wrong host", `postgresql://example.com:5433/${TEST_DATABASE_PREFIX}safe`],
    ["wrong port", `postgresql://localhost:5432/${TEST_DATABASE_PREFIX}safe`],
    ["wrong database prefix", "postgresql://localhost:5433/my_group_buying_test_other"],
    ["development database", `postgresql://localhost:5433/${DEVELOPMENT_DATABASE}`],
  ])("rejects %s without opening a database connection", (_label, url) => {
    expect(() => requireSafeTestDatabaseUrl(url)).toThrow();
  });
});

integrationSuite("first admin bootstrap PostgreSQL concurrency", () => {
  let databaseUrl: string;
  let databaseClientInitialized = false;

  beforeAll(() => {
    databaseUrl = requireSafeTestDatabaseUrl(rawTestDatabaseUrl!);
    // Production code reads DATABASE_URL. It receives only the URL that passed
    // the TEST_DATABASE_URL safety guard above.
    process.env.DATABASE_URL = databaseUrl;
  });

  afterAll(async () => {
    try {
      if (databaseClientInitialized) {
        const { getDb } = await import("@/lib/db");
        await getDb().$disconnect();
      }
    } finally {
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  });

  test("allows exactly one of two concurrent first-admin attempts", async () => {
    const [{ createFirstAdmin }, { getDb }, { verifyPassword }] = await Promise.all([
      import("@/lib/auth/bootstrap-admin"),
      import("@/lib/db"),
      import("@/lib/auth/password"),
    ]);
    const db = getDb();
    databaseClientInitialized = true;

    const adminA = {
      email: `admin-a-${randomBytes(8).toString("hex")}@example.com`,
      password: `A ${randomBytes(24).toString("base64url")}`,
    };
    const adminB = {
      email: `admin-b-${randomBytes(8).toString("hex")}@example.com`,
      password: `B ${randomBytes(24).toString("base64url")}`,
    };

    const results = await Promise.allSettled([
      createFirstAdmin(adminA),
      createFirstAdmin(adminB),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejection = rejected[0] as PromiseRejectedResult;
    expect(rejection.reason).toMatchObject({
      code: expect.stringMatching(/^(CONFLICT|USER_EXISTS)$/),
    });

    const success = (fulfilled[0] as PromiseFulfilledResult<{
      id: string;
      email: string;
      isActive: boolean;
    }>).value;
    expect(success).not.toHaveProperty("passwordHash");

    const users = await db.user.findMany();
    expect(users).toHaveLength(1);
    expect([adminA.email, adminB.email]).toContain(users[0].email);
    expect(users[0].isActive).toBe(true);
    expect(success).toEqual({
      id: users[0].id,
      email: users[0].email,
      isActive: true,
    });

    const winner = users[0].email === adminA.email ? adminA : adminB;
    const loser = users[0].email === adminA.email ? adminB : adminA;
    expect(users[0].passwordHash).not.toBe(winner.password);
    expect(users[0].passwordHash).not.toBe(loser.password);
    await expect(verifyPassword(winner.password, users[0].passwordHash)).resolves.toBe(true);
    await expect(verifyPassword(loser.password, users[0].passwordHash)).resolves.toBe(false);

    const sessionCount = await db.session.count();
    expect(sessionCount).toBe(0);

    console.info(
      `bootstrap concurrency result: fulfilled=${fulfilled.length} rejected=${rejected.length} ` +
      `code=${rejection.reason.code} users=${users.length} sessions=${sessionCount}`,
    );
  });
});
