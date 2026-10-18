import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
export async function consumeRateLimit(scope: string, identity: string, limit: number, seconds = 60) {
  const key = createHash("sha256").update(`${scope}:${identity}`).digest("hex");
  const rows = await getDb().$queryRaw<{ count: number }[]>`
    INSERT INTO "RequestRateLimit" ("key", "windowStart", "count") VALUES (${key}, now(), 1)
    ON CONFLICT ("key") DO UPDATE SET
    "count" = CASE WHEN "RequestRateLimit"."windowStart" <= now() - ${seconds} * interval '1 second' THEN 1 ELSE "RequestRateLimit"."count" + 1 END,
    "windowStart" = CASE WHEN "RequestRateLimit"."windowStart" <= now() - ${seconds} * interval '1 second' THEN now() ELSE "RequestRateLimit"."windowStart" END
    RETURNING "count"`;
  return rows[0].count <= limit;
}
export async function enforceRateLimit(scope: string, identity: string, limit: number, seconds = 60) {
  if (!["production", "staging"].includes(process.env.QBUY_ENV ?? "")) return;
  if (!await consumeRateLimit(scope, identity, limit, seconds)) throw new Error("RATE_LIMITED");
}
