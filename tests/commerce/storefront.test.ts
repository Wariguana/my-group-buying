// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
const db = vi.hoisted(() => ({ category: { findMany: vi.fn() }, $queryRaw: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
import { listStorefront } from "@/lib/commerce/public";
beforeEach(() => {
  vi.resetAllMocks(); db.category.findMany.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValueOnce([{ count: 60 }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
});
test("database pages cards before aggregating all active SKU balances without option trees", async () => {
  const result = await listStorefront({ page: "2" });
  expect(result).toMatchObject({ count: 60, page: 2, totalPages: 3 });
  const query = db.$queryRaw.mock.calls[1][0];
  expect(query.sql).toContain('WITH page AS');
  expect(query.sql).toContain('LIMIT ? OFFSET ?');
  expect(query.values).toContain(24);
  expect(query.sql).toContain('bool_and');
  expect(query.sql).toContain('i."skuId" IS NOT NULL');
  expect(query.sql).toContain('i."onHand" - i.reserved - i.allocated');
  expect(query.sql).not.toContain('GroupBuyItem');
  expect(query.sql).not.toContain('ProductSkuOptionValue');
});
test.each(["-1", "0", "1.5", "Infinity", "junk"])("invalid page %s returns to first page", async page => {
  expect((await listStorefront({ page })).page).toBe(1);
});
test("out-of-range page clamps to last reachable page", async () => {
  expect((await listStorefront({ page: "999999" })).page).toBe(3);
  expect(db.$queryRaw.mock.calls[1][0].values).toContain(48);
});
test("featured availability is filtered before count and limit, ordered globally", async () => {
  await listStorefront({ view: "featured", category: "category", q: "Current product" });
  for (const [query] of db.$queryRaw.mock.calls) {
    expect(query.sql).toContain('EXISTS (SELECT 1');
    expect(query.sql).toContain('p."skuInventoryEnabled"');
    expect(query.values).toContain('category');
    expect(query.values).toContain('%Current product%');
  }
  expect(db.$queryRaw.mock.calls[1][0].sql).toContain('ORDER BY g."featuredSort" ASC, g.id ASC LIMIT');
});
test("ended filtering and parameterized search preserve lifecycle cards", async () => {
  await listStorefront({ view: "ended", q: "' OR true --" });
  const query = db.$queryRaw.mock.calls[0][0];
  expect(query.sql).toContain('g."endAt" <= ?');
  expect(query.sql).not.toContain("' OR true --");
  expect(query.values).toContain("%' OR true --%");
});
