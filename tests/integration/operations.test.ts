// @vitest-environment node
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, describe, expect, test, vi } from "vitest";
import { validateE2eTargetDatabaseUrl } from "../../scripts/lib/e2e-database";
vi.mock("server-only", () => ({}));
const enabled = process.env.SKU_INTEGRATION_TEST === "1";
if (enabled) validateE2eTargetDatabaseUrl(process.env.DATABASE_URL!);
(enabled ? describe : describe.skip)("production operations PostgreSQL", () => {
  afterAll(async () => { const { getDb } = await import("@/lib/db"); await getDb().$disconnect(); });
  test("atomic shared limits allow exactly 5 of 20 concurrent attempts and recover after window", async () => {
    const { consumeRateLimit } = await import("@/lib/operations/rate-limit");
    const { getDb } = await import("@/lib/db");
    const id = randomUUID();
    const results = await Promise.all(Array.from({ length: 20 }, () => consumeRateLimit("test", id, 5, 60)));
    expect(results.filter(Boolean)).toHaveLength(5);
    await getDb().requestRateLimit.updateMany({ data: { windowStart: new Date(Date.now() - 120000) } });
    expect(await consumeRateLimit("test", id, 5, 60)).toBe(true);
  });
  test("concurrent worker skips, failures retain last success, recovery clears failure", async () => {
    const { workerTick } = await import("@/lib/operations/worker");
    const { getDb } = await import("@/lib/db");
    let release!: () => void, started!: () => void;
    const running = new Promise<void>(resolve => { started = resolve; });
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const first = workerTick("checkouts", async () => { started(); await blocked; return 3; });
    await running;
    try { expect(await workerTick("checkouts", async () => { throw new Error("must not run"); })).toMatchObject({ skipped: true }); }
    finally { release(); }
    expect(await first).toMatchObject({ processed: 3 });
    const before = await getDb().workerHeartbeat.findUniqueOrThrow({ where: { name: "checkouts" } });
    await expect(workerTick("checkouts", async () => { throw new Error("sensitive payload must be redacted"); })).rejects.toThrow("WORKER_FAILED");
    expect(await getDb().workerHeartbeat.findUniqueOrThrow({ where: { name: "checkouts" } })).toMatchObject({ lastSuccessAt: before.lastSuccessAt, lastError: "WORKER_FAILED" });
    await workerTick("checkouts", async () => 0);
    expect(await getDb().workerHeartbeat.findUniqueOrThrow({ where: { name: "checkouts" } })).toMatchObject({ lastError: null, processed: 0 });
  });
  test("abandoned session lock releases on connection termination", async () => {
    const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
    await c.query("SELECT pg_advisory_lock(41004, 2)"); await c.end();
    const { workerTick } = await import("@/lib/operations/worker");
    expect(await workerTick("notifications", async () => 0)).toMatchObject({ skipped: false });
  });
  test("monitor detects stale workers and exposes counts without customer payloads", async () => {
    const { getDb } = await import("@/lib/db");
    const { operationalHealth } = await import("@/lib/operations/health");
    await getDb().workerHeartbeat.updateMany({ data: { lastSuccessAt: new Date(0) } });
    const h = await operationalHealth(); expect(h.healthy).toBe(false); expect(h.workers.every(w => !w.healthy)).toBe(true);
    expect(JSON.stringify(h)).not.toMatch(/customerPhone|bankAccount|password|token/);
  });
  test("configuration evidence rejects overwriting and deletion", async () => {
    const { getDb } = await import("@/lib/db");
    const row = await getDb().configurationAudit.create({ data: { actorId: randomUUID(), operation: "BANK_CONFIG", target: "default", fingerprint: "a".repeat(64) } });
    await expect(getDb().configurationAudit.update({ where: { id: row.id }, data: { fingerprint: "b".repeat(64) } })).rejects.toThrow();
    await expect(getDb().configurationAudit.delete({ where: { id: row.id } })).rejects.toThrow();
  });
  test("runtime role cannot modify immutable audit evidence or migration history", async () => {
    const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
    const role = "qbuy_role_" + randomUUID().replaceAll("-", "");
    try {
      await c.query(`CREATE ROLE "${role}" NOLOGIN`);
      await c.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      await c.query(`GRANT SELECT, INSERT ON "CheckoutAudit" TO "${role}"`);
      await c.query(`SET ROLE "${role}"`);
      await expect(c.query('DELETE FROM "CheckoutAudit" WHERE false')).rejects.toThrow(/permission denied/);
      await expect(c.query('SELECT * FROM "_prisma_migrations"')).rejects.toThrow(/permission denied/);
      await expect(c.query('CREATE TABLE forbidden_test (id int)')).rejects.toThrow(/permission denied/);
    } finally { await c.query("RESET ROLE"); await c.query(`DROP OWNED BY "${role}"`); await c.query(`DROP ROLE "${role}"`); await c.end(); }
  });
});
