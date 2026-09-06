// @vitest-environment node

import { afterEach, beforeEach, expect, test, vi } from "vitest";

const drivers = vi.hoisted(() => ({
  Pool: vi.fn(class Pool {}),
  PrismaPg: vi.fn(class PrismaPg {}),
  PrismaClient: vi.fn(class PrismaClient {}),
}));

vi.mock("server-only", () => ({}));
vi.mock("pg", () => ({ Pool: drivers.Pool }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: drivers.PrismaPg }));
vi.mock("@/generated/prisma/client", () => ({ PrismaClient: drivers.PrismaClient }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  Reflect.deleteProperty(globalThis, "groupBuyingPrisma");
  // All drivers are mocked; this URL is never used for a connection.
  vi.stubEnv("DATABASE_URL", "postgresql://example.invalid/bootstrap_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  Reflect.deleteProperty(globalThis, "groupBuyingPrisma");
});

test("lazily creates and reuses one Prisma client and pg Pool", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const { getDb } = await import("@/lib/db");
  expect(drivers.Pool).not.toHaveBeenCalled();
  const client = getDb();
  expect(getDb()).toBe(client);
  expect(drivers.Pool).toHaveBeenCalledExactlyOnceWith({
    connectionString: "postgresql://example.invalid/bootstrap_test",
  });
  expect(drivers.PrismaPg).toHaveBeenCalledExactlyOnceWith(
    drivers.Pool.mock.instances[0], { disposeExternalPool: true },
  );
  expect(drivers.PrismaClient).toHaveBeenCalledExactlyOnceWith({
    adapter: drivers.PrismaPg.mock.instances[0], log: [],
  });
  expect(globalThis).not.toHaveProperty("groupBuyingPrisma");
});

test("reuses the development client and pool across module reloads", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const firstModule = await import("@/lib/db");
  const client = firstModule.getDb();
  vi.resetModules();
  const reloadedModule = await import("@/lib/db");
  expect(reloadedModule.getDb()).toBe(client);
  expect(drivers.Pool).toHaveBeenCalledTimes(1);
  expect(drivers.PrismaClient).toHaveBeenCalledTimes(1);
});

test("rejects missing configuration before constructing a pool", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATABASE_URL", undefined);
  const { getDb } = await import("@/lib/db");
  expect(getDb).toThrow("DATABASE_URL is required.");
  expect(drivers.Pool).not.toHaveBeenCalled();
  expect(drivers.PrismaClient).not.toHaveBeenCalled();
});
