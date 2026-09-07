import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForDb = globalThis as typeof globalThis & {
  groupBuyingPrisma?: PrismaClient;
};

let client: PrismaClient | undefined;

/** Lazily create one client/pool per process, surviving development HMR. */
export function getDb(): PrismaClient {
  if (client) return client;
  if (process.env.NODE_ENV === "development" && globalForDb.groupBuyingPrisma) {
    client = globalForDb.groupBuyingPrisma;
    return client;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  client = new PrismaClient({ adapter, log: [] });

  if (process.env.NODE_ENV === "development") {
    globalForDb.groupBuyingPrisma = client;
  }
  return client;
}
