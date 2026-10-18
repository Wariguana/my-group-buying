import "server-only";
import { Pool } from "pg";
import { getDb } from "@/lib/db";
// Session advisory lock is held on a dedicated connection across external IO.
// A killed process releases it automatically; per-event leases handle interrupted delivery.
export async function workerTick(name: "checkouts" | "notifications", work: () => Promise<number>) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  const client = await pool.connect().catch(async () => { await pool.end(); throw new Error("WORKER_CONNECTION_FAILED"); });
  let locked = false;
  try {
    const result = await client.query("SELECT pg_try_advisory_lock(41004, $1) AS locked", [name === "checkouts" ? 1 : 2]);
    locked = result.rows[0].locked;
    if (!locked) return { skipped: true, processed: 0 };
    const processed = await work();
    await getDb().workerHeartbeat.upsert({ where: { name }, create: { name, processed, lastSuccessAt: new Date() }, update: { processed, lastSuccessAt: new Date(), lastError: null } });
    await getDb().requestRateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 86400000) } } });
    return { skipped: false, processed };
  } catch {
    if (locked) await getDb().workerHeartbeat.upsert({ where: { name }, create: { name, lastFailureAt: new Date(), lastError: "WORKER_FAILED" }, update: { lastFailureAt: new Date(), lastError: "WORKER_FAILED" } }).catch(() => undefined);
    throw new Error("WORKER_FAILED");
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(41004, $1)", [name === "checkouts" ? 1 : 2]).catch(() => undefined);
    client.release(); await pool.end();
  }
}
