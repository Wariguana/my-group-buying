// @vitest-environment node
import { expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  workerHeartbeat: { findMany: vi.fn().mockResolvedValue([]) },
  checkout: { count: vi.fn().mockResolvedValue(0) },
  payment: { count: vi.fn().mockResolvedValue(0) },
  refundObligation: { count: vi.fn().mockResolvedValue(0) },
  cancellationRequest: { count: vi.fn().mockResolvedValue(0) },
  qbReturnCase: { count: vi.fn().mockResolvedValue(0) },
  checkoutOutbox: { count: vi.fn().mockResolvedValue(0) },
  $queryRaw: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
import { operationalHealth } from "@/lib/operations/health";

test("health retains numeric queue names and JSON serialization after aggregate queries", async () => {
  db.$queryRaw.mockResolvedValueOnce([{ count: BigInt(2) }]).mockResolvedValueOnce([{ count: BigInt(1) }]).mockResolvedValueOnce([{ count: BigInt(0) }]);
  const health = await operationalHealth();
  expect(health.queues).toMatchObject({ shipmentPending: 2, shippingErrors: 1, inventory: 0 });
  expect(health.queues).not.toHaveProperty("shipmentPendingRows");
  expect(health.queues).not.toHaveProperty("shippingErrorRows");
  expect(() => JSON.stringify(health)).not.toThrow();
});
