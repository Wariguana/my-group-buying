// @vitest-environment node

import { describe, expect, test, vi } from "vitest";
import {
  E2eDatabaseLifecycle,
  deriveE2eControlDatabaseUrl,
  deriveE2eDatabaseUrl,
  generateE2eDatabaseName,
  isValidE2eDatabaseName,
  validateE2eSourceDatabaseUrl,
  validateE2eTargetDatabaseUrl,
  type E2eDatabaseControl,
} from "../scripts/lib/e2e-database";

function createControl(rowCounts: number[]): E2eDatabaseControl & {
  query: ReturnType<typeof vi.fn>;
} {
  return {
    query: vi.fn(async () => ({ rowCount: rowCounts.shift() ?? 0 })),
  };
}

describe("E2E source DATABASE_URL validation", () => {
  test("accepts the local source and returns no credentials", () => {
    const source = validateE2eSourceDatabaseUrl(
      "postgresql://local-user:local-password@localhost:5433/my_group_buying_dev",
    );

    expect(source).toEqual({
      environment: "local",
      protocol: "postgresql:",
      hostname: "localhost",
      port: 5433,
      database: "my_group_buying_dev",
    });
    expect(source).not.toHaveProperty("username");
    expect(source).not.toHaveProperty("password");
  });

  test("accepts the CI source", () => {
    expect(validateE2eSourceDatabaseUrl("postgres://127.0.0.1:5432/ci")).toEqual({
      environment: "ci",
      protocol: "postgres:",
      hostname: "127.0.0.1",
      port: 5432,
      database: "ci",
    });
  });

  test.each([
    ["remote hostname", "postgresql://db.example.com:5433/my_group_buying_dev"],
    ["wrong local port", "postgresql://localhost:5432/my_group_buying_dev"],
    ["wrong CI port", "postgresql://localhost:5433/ci"],
    ["arbitrary database", "postgresql://localhost:5433/other"],
    ["E2E source", `postgresql://localhost:5433/${generateE2eDatabaseName()}`],
    ["query string", "postgresql://localhost:5433/my_group_buying_dev?schema=public"],
    ["empty query string", "postgresql://localhost:5433/my_group_buying_dev?"],
    ["fragment", "postgresql://localhost:5433/my_group_buying_dev#fragment"],
    ["empty fragment", "postgresql://localhost:5433/my_group_buying_dev#"],
    ["missing database", "postgresql://localhost:5433"],
    ["malformed URL", "not a URL"],
  ])("rejects %s before database access", (_label, sourceUrl) => {
    expect(() => validateE2eSourceDatabaseUrl(sourceUrl)).toThrow(
      "DATABASE_URL must target the approved",
    );
  });
});

describe("E2E database names", () => {
  test("generates unique lowercase PostgreSQL-safe names", () => {
    const first = generateE2eDatabaseName();
    const second = generateE2eDatabaseName();

    expect(isValidE2eDatabaseName(first)).toBe(true);
    expect(isValidE2eDatabaseName(second)).toBe(true);
    expect(first).not.toBe(second);
    expect(first.length).toBeLessThanOrEqual(63);
  });

  test.each([
    ["bad prefix", "other_e2e_0123456789abcdef0123456789abcdef"],
    ["uppercase", "my_group_buying_e2e_0123456789abcdef0123456789abcdeF"],
    ["slash", "my_group_buying_e2e_0123456789abcdef0123456789abcde/"],
    ["quote", "my_group_buying_e2e_0123456789abcdef0123456789abcde\""],
    ["semicolon", "my_group_buying_e2e_0123456789abcdef0123456789abcde;"],
    ["space", "my_group_buying_e2e_0123456789abcdef0123456789abcde "],
    ["overly long", `my_group_buying_e2e_${"a".repeat(44)}`],
    ["empty suffix", "my_group_buying_e2e_"],
    ["short suffix", "my_group_buying_e2e_abc123"],
    ["non-hex suffix", "my_group_buying_e2e_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"],
  ])("rejects %s", (_label, databaseName) => {
    expect(isValidE2eDatabaseName(databaseName)).toBe(false);
  });
});

describe("E2E database ownership", () => {
  const localSource = "postgresql://localhost:5433/my_group_buying_dev";

  test("cannot drop before successful creation", async () => {
    const lifecycle = new E2eDatabaseLifecycle(localSource);
    const control = createControl([]);

    expect(lifecycle.canDropDatabase(lifecycle.targetDatabaseName)).toBe(false);
    await expect(lifecycle.dropDatabase(control)).rejects.toThrow("not owned");
    expect(control.query).not.toHaveBeenCalled();
  });

  test("fails instead of reusing an existing target", async () => {
    const lifecycle = new E2eDatabaseLifecycle(localSource);
    const control = createControl([1]);

    await expect(lifecycle.createDatabase(control)).rejects.toThrow("refusing to reuse");
    expect(lifecycle.canDropDatabase(lifecycle.targetDatabaseName)).toBe(false);
    expect(control.query).toHaveBeenCalledTimes(1);
  });

  test("failed creation does not grant drop ownership", async () => {
    const lifecycle = new E2eDatabaseLifecycle(localSource);
    const control = createControl([]);
    control.query
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockRejectedValueOnce(new Error("creation failed"));

    await expect(lifecycle.createDatabase(control)).rejects.toThrow("creation failed");
    expect(lifecycle.canDropDatabase(lifecycle.targetDatabaseName)).toBe(false);
  });

  test("successful creation grants ownership only for the exact target", async () => {
    const lifecycle = new E2eDatabaseLifecycle(localSource);
    const control = createControl([0, 0]);
    const differentTarget = generateE2eDatabaseName();

    await lifecycle.createDatabase(control);

    expect(lifecycle.canDropDatabase(lifecycle.targetDatabaseName)).toBe(true);
    expect(lifecycle.canDropDatabase(differentTarget)).toBe(false);
    await expect(lifecycle.dropDatabase(control, differentTarget)).rejects.toThrow("not owned");
  });

  test("checks absence before creating exactly the validated quoted target", async () => {
    const lifecycle = new E2eDatabaseLifecycle(localSource);
    const control = createControl([0, 0]);

    await lifecycle.createDatabase(control);

    expect(control.query).toHaveBeenCalledTimes(2);
    expect(control.query).toHaveBeenNthCalledWith(
      1,
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [lifecycle.targetDatabaseName],
    );

    const createStatement = `CREATE DATABASE "${lifecycle.targetDatabaseName}"`;
    expect(control.query).toHaveBeenNthCalledWith(2, createStatement);
    const createCalls = control.query.mock.calls.filter(
      ([sql]) => typeof sql === "string" && sql.startsWith("CREATE DATABASE "),
    );
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]).toEqual([createStatement]);
    expect(createCalls[0][0]).toMatch(
      /^CREATE DATABASE "my_group_buying_e2e_[a-f0-9]{32}"$/,
    );
    expect(createCalls[0][0]).not.toContain(lifecycle.source.database);
  });

  test("DROP failure rejects and retains ownership instead of reporting cleanup", async () => {
    const lifecycle = new E2eDatabaseLifecycle(localSource);
    const control = createControl([]);
    control.query
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockRejectedValueOnce(new Error("drop failed"));

    await lifecycle.createDatabase(control);
    await expect(lifecycle.dropDatabase(control)).rejects.toThrow("drop failed");

    expect(control.query).toHaveBeenCalledTimes(3);
    expect(control.query).toHaveBeenLastCalledWith(
      `DROP DATABASE "${lifecycle.targetDatabaseName}" WITH (FORCE)`,
    );
    expect(lifecycle.canDropDatabase(lifecycle.targetDatabaseName)).toBe(true);
  });

  test("successful cleanup uses FORCE, verifies removal, and revokes ownership", async () => {
    const lifecycle = new E2eDatabaseLifecycle(localSource);
    const control = createControl([0, 0, 0]);

    await lifecycle.createDatabase(control);
    await lifecycle.dropDatabase(control);

    expect(control.query).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/^DROP DATABASE "my_group_buying_e2e_[a-f0-9]{32}" WITH \(FORCE\)$/),
    );
    expect(control.query).toHaveBeenNthCalledWith(
      4,
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [lifecycle.targetDatabaseName],
    );
    expect(lifecycle.canDropDatabase(lifecycle.targetDatabaseName)).toBe(false);
    await expect(lifecycle.dropDatabase(control)).rejects.toThrow("not owned");
  });
});

describe("E2E target DATABASE_URL derivation", () => {
  test("replaces only the database pathname and introduces no query or fragment", () => {
    const sourceUrl =
      "postgresql://e2e-user:p%40ssword@localhost:5433/my_group_buying_dev";
    const databaseName = generateE2eDatabaseName();
    const target = new URL(deriveE2eDatabaseUrl(sourceUrl, databaseName));

    expect(target.protocol).toBe("postgresql:");
    expect(target.hostname).toBe("localhost");
    expect(target.port).toBe("5433");
    expect(target.pathname).toBe(`/${databaseName}`);
    expect(target.search).toBe("");
    expect(target.hash).toBe("");
    // Compare credentials as booleans so assertion output cannot disclose them.
    expect(target.username === "e2e-user").toBe(true);
    expect(target.password === "p%40ssword").toBe(true);
  });
});

describe("E2E control DATABASE_URL derivation", () => {
  test("validates the source and changes only the database pathname", () => {
    const source = "postgresql://e2e-user:p%40ssword@localhost:5433/my_group_buying_dev";
    const control = new URL(deriveE2eControlDatabaseUrl(source));

    expect(control.pathname).toBe("/postgres");
    expect(control.hostname).toBe("localhost");
    expect(control.port).toBe("5433");
    expect(control.search).toBe("");
    expect(control.hash).toBe("");
    expect(control.username === "e2e-user").toBe(true);
    expect(control.password === "p%40ssword").toBe(true);
  });

  test("rejects an unapproved source before deriving a control URL", () => {
    expect(() => deriveE2eControlDatabaseUrl(
      "postgresql://user:secret@db.example.com:5433/my_group_buying_dev",
    )).toThrow("DATABASE_URL must target the approved");
  });
});

describe("E2E target DATABASE_URL validation", () => {
  test("accepts a target derived from each approved source", () => {
    for (const source of [
      "postgresql://localhost:5433/my_group_buying_dev",
      "postgres://127.0.0.1:5432/ci",
    ]) {
      const target = deriveE2eDatabaseUrl(source, generateE2eDatabaseName());
      expect(() => validateE2eTargetDatabaseUrl(target)).not.toThrow();
    }
  });

  test.each([
    "postgresql://localhost:5433/my_group_buying_dev",
    `postgresql://example.com:5433/${generateE2eDatabaseName()}`,
    `postgresql://localhost:5444/${generateE2eDatabaseName()}`,
    `postgresql://localhost:5433/${generateE2eDatabaseName()}?schema=public`,
  ])("rejects a non-isolated target case %#", (target) => {
    expect(() => validateE2eTargetDatabaseUrl(target)).toThrow(
      "DATABASE_URL must target an isolated E2E database.",
    );
  });
});
