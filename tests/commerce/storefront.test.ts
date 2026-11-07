// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
const db = vi.hoisted(() => ({ category: { findMany: vi.fn() }, groupBuy: { findMany: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
import { listStorefront } from "@/lib/commerce/public";
function offer(stock: number | null = 2, managed = true, price = 299) {
  return { salePrice: price, isActive: true,
    groupBuy: { status: "PUBLISHED", isArchived: false, startAt: new Date(0), endAt: new Date("2099-01-01") },
    sku: { isActive: true, product: { isActive: true, skuInventoryEnabled: managed },
      inventory: stock === null ? null : { onHand: stock, reserved: 0, allocated: 0 } } };
}
function group(offers = [offer()], legacyStock: number | null = null) {
  return { id: "group", title: "Current group", slug: "group", description: null,
    startAt: new Date(0), endAt: new Date("2099-01-01"), isFeatured: true, featuredSort: 1,
    category: null, images: [], skuOffers: offers,
    items: [{ salePrice: 1, stock: legacyStock }] };
}
beforeEach(() => { vi.resetAllMocks(); db.category.findMany.mockResolvedValue([]); });
test("storefront prices and variation only use current SKU offers", async () => {
  db.groupBuy.findMany.mockResolvedValue([group()]);
  expect((await listStorefront({})).cards[0]).toMatchObject({ minPrice: 299, priceVaries: false, soldOut: false, purchasable: true });
  db.groupBuy.findMany.mockResolvedValue([group([offer(2, true, 299), offer(3, true, 399)])]);
  expect((await listStorefront({})).cards[0]).toMatchObject({ minPrice: 299, priceVaries: true });
});
test.each([null, 0, 9999])("legacy stock %j cannot override exhausted SKU inventory", async legacyStock => {
  db.groupBuy.findMany.mockResolvedValue([group([offer(0)], legacyStock)]);
  const result = await listStorefront({});
  expect(result.cards[0]).toMatchObject({ soldOut: true, purchasable: false });
  expect(result.featured).toEqual([]);
});
test.each([[null, true], [2, false]] as const)("unverified stock stays unavailable rather than sold out: %j/%j", async (stock, managed) => {
  db.groupBuy.findMany.mockResolvedValue([group([offer(stock, managed)], 0)]);
  const result = await listStorefront({});
  expect(result.cards[0]).toMatchObject({ minPrice: 299, soldOut: false, purchasable: false });
  expect(result.featured).toEqual([]);
});
test("legacy-only group keeps its lifecycle card but has no price or purchasable stock", async () => {
  db.groupBuy.findMany.mockResolvedValue([group([])]);
  const result = await listStorefront({});
  expect(result.cards[0]).toMatchObject({ minPrice: null, priceVaries: false, soldOut: false, purchasable: false, startAt: new Date(0), endAt: new Date("2099-01-01") });
  expect(result.featured).toEqual([]);
});
test("search and projections never read historical items; inactive SKU filtering remains", async () => {
  db.groupBuy.findMany.mockResolvedValue([]);
  await listStorefront({ q: "Current product", view: "ended", category: "category" });
  const query = db.groupBuy.findMany.mock.calls[0][0];
  expect(query.select).not.toHaveProperty("items");
  expect(query.where.OR).toEqual([
    { title: { contains: "Current product", mode: "insensitive" } },
    { skuOffers: { some: { isActive: true, sku: { isActive: true, product: { isActive: true, name: { contains: "Current product", mode: "insensitive" } } } } } },
  ]);
  expect(query.where).toMatchObject({ status: "PUBLISHED", isArchived: false, endAt: { lte: expect.any(Date) }, category: { id: "category", isActive: true } });
  expect(query.select.skuOffers.where).toEqual({ isActive: true, sku: { isActive: true, product: { isActive: true } } });
});
