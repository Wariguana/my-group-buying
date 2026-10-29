// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
const db = vi.hoisted(() => ({ checkout: { count: vi.fn() }, qbOrder: { count: vi.fn(), findMany: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
import { getAdminWorkspace } from "@/lib/admin/workspace";
import { lifecycleQueueFilters } from "@/lib/qbuy/queries";

beforeEach(() => { vi.resetAllMocks(); db.checkout.count.mockResolvedValue(2); db.qbOrder.count.mockResolvedValue(4); db.qbOrder.findMany.mockResolvedValue([]); });

test("QB work counts reuse every linked lifecycle queue and Taipei day boundaries", async () => {
  const now = new Date("2026-10-28T17:00:00Z");
  const result = await getAdminWorkspace(now);
  const filters = lifecycleQueueFilters(now);
  for (const task of result.work.filter(task => task.href.includes("queue="))) {
    const key = new URL(task.href, "http://localhost").searchParams.get("queue")!;
    expect(db.checkout.count).toHaveBeenCalledWith({ where: filters[key] });
  }
  expect(result.work).toHaveLength(9);
  expect(result.work.every(task => task.count === 2)).toBe(true);
  expect(db.qbOrder.count).toHaveBeenCalledWith({ where: { createdAt: { gte: new Date("2026-10-28T16:00:00Z"), lt: new Date("2026-10-29T16:00:00Z") } } });
  const recent = db.qbOrder.findMany.mock.calls[0][0];
  expect(recent.take).toBe(5);
  expect(recent.select).not.toHaveProperty("itemsSnapshot");
  expect(recent.select).not.toHaveProperty("deliverySnapshot");
});

test("any count failure rejects the projection instead of silently using zero", async () => {
  db.checkout.count.mockRejectedValueOnce(new Error("unavailable"));
  await expect(getAdminWorkspace()).rejects.toThrow("unavailable");
});
