// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  groupBuy: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));

import {
  getPublicGroupBuyBySlug,
  listPublicGroupBuys,
  publicGroupBuyDetailSelect,
  publicGroupBuyListSelect,
} from "@/lib/group-buys/public-service";

const now = new Date("2026-09-09T04:00:00.000Z");
const validSlug = "gb-AbCdEf0123_-xyZ9";

function listRow(
  id: string,
  slug: string,
  startAt: string,
  endAt: string,
) {
  return {
    id,
    slug,
    title: slug,
    description: null,
    coverImageUrl: null,
    startAt: new Date(startAt),
    endAt: new Date(endAt),
  };
}

function detailRow() {
  return {
    slug: validSlug,
    title: "公開團購",
    description: "說明",
    coverImageUrl: null,
    startAt: new Date("2026-09-09T03:00:00.000Z"),
    endAt: new Date("2026-09-09T05:00:00.000Z"),
    items: [{
      salePrice: 150,
      stock: 0,
      purchaseLimit: null,
      sortOrder: 0,
      product: { name: "蘋果", unit: "袋" },
    }],
    pickups: [{
      pickupStartAt: null,
      pickupEndAt: null,
      sortOrder: 0,
      pickupLocation: { name: "一號店", address: "台北市" },
    }],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  db.groupBuy.findMany.mockResolvedValue([]);
  db.groupBuy.findFirst.mockResolvedValue(null);
});

test("list uses a narrow PUBLISHED-only query with deterministic database ordering", async () => {
  expect(await listPublicGroupBuys(now)).toEqual({ ok: true, value: [] });
  expect(db.groupBuy.findMany).toHaveBeenCalledWith({
    where: { status: "PUBLISHED" },
    select: publicGroupBuyListSelect,
    orderBy: [{ startAt: "desc" }, { id: "desc" }],
  });
  expect(publicGroupBuyListSelect).toEqual({
    id: true,
    slug: true,
    title: true,
    description: true,
    coverImageUrl: true,
    startAt: true,
    endAt: true,
  });
});

test("list groups active, scheduled, and ended while preserving deterministic query order within each group", async () => {
  db.groupBuy.findMany.mockResolvedValue([
    listRow("4", "gb-0000000000000004", "2026-09-11T00:00:00.000Z", "2026-09-12T00:00:00.000Z"),
    listRow("3", "gb-0000000000000003", "2026-09-09T03:30:00.000Z", "2026-09-09T05:00:00.000Z"),
    listRow("2", "gb-0000000000000002", "2026-09-09T03:00:00.000Z", "2026-09-09T06:00:00.000Z"),
    listRow("1", "gb-0000000000000001", "2026-09-01T00:00:00.000Z", "2026-09-02T00:00:00.000Z"),
  ]);

  const result = await listPublicGroupBuys(now);
  expect(result.ok && result.value.map(({ id, lifecycle }) => [id, lifecycle])).toEqual([
    ["3", "active"],
    ["2", "active"],
    ["4", "scheduled"],
    ["1", "ended"],
  ]);
});

test("detail validates slug before querying and requires slug plus PUBLISHED status", async () => {
  expect(await getPublicGroupBuyBySlug("bad", now)).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(db.groupBuy.findFirst).not.toHaveBeenCalled();

  db.groupBuy.findFirst.mockResolvedValue(detailRow());
  const result = await getPublicGroupBuyBySlug(validSlug, now);
  expect(result.ok && result.value.lifecycle).toBe("active");
  expect(db.groupBuy.findFirst).toHaveBeenCalledWith({
    where: { slug: validSlug, status: "PUBLISHED" },
    select: publicGroupBuyDetailSelect,
  });
});

test.each(["DRAFT", "CANCELLED"])("a %s slug is unavailable at the public service boundary", async () => {
  db.groupBuy.findFirst.mockResolvedValue(null);
  expect(await getPublicGroupBuyBySlug(validSlug, now)).toEqual({ ok: false, error: "NOT_FOUND" });
});

test("detail projection filters inactive items, Products, and PickupLocations and orders child rows", () => {
  expect(publicGroupBuyDetailSelect.items.where).toEqual({
    isActive: true,
    product: { isActive: true },
  });
  expect(publicGroupBuyDetailSelect.items.orderBy).toEqual([{ sortOrder: "asc" }, { id: "asc" }]);
  expect(publicGroupBuyDetailSelect.pickups.where).toEqual({ pickupLocation: { isActive: true } });
  expect(publicGroupBuyDetailSelect.pickups.orderBy).toEqual([{ sortOrder: "asc" }, { id: "asc" }]);
});

test("public projections never select cost, default price, supplier, status, or internal child IDs", () => {
  const projection = JSON.stringify({ publicGroupBuyListSelect, publicGroupBuyDetailSelect });
  for (const forbidden of ["cost", "defaultPrice", "supplier", "publishedAt", "productId", "pickupLocationId", "createdAt", "updatedAt"]) {
    expect(projection).not.toContain(forbidden);
  }
});

test("database failures map to safe public failures", async () => {
  db.groupBuy.findMany.mockRejectedValue(new Error("private database detail"));
  await expect(listPublicGroupBuys(now)).resolves.toEqual({ ok: false, error: "FAILED" });

  db.groupBuy.findFirst.mockRejectedValue(new Error("private database detail"));
  await expect(getPublicGroupBuyBySlug(validSlug, now)).resolves.toEqual({ ok: false, error: "FAILED" });
});
