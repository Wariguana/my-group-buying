// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { validateE2eTargetDatabaseUrl } from "../../scripts/lib/e2e-database";
vi.mock("server-only", () => ({}));
const enabled = process.env.SKU_INTEGRATION_TEST === "1";
if (enabled) validateE2eTargetDatabaseUrl(process.env.DATABASE_URL!);
const suite = enabled ? describe : describe.skip;
suite("QBUY shared inventory, storefront and cart PostgreSQL", () => {
  let db: ReturnType<typeof import("@/lib/db")["getDb"]>;
  let stock: typeof import("@/lib/commerce/inventory")["adjustInventory"];
  let validate: typeof import("@/lib/commerce/public")["validateCart"];
  let admin: typeof import("@/lib/commerce/admin")["mutateCommerce"];
  let publicApi: typeof import("@/lib/commerce/public");
  let actorId: string;
  let legacySequence = 0;
  beforeAll(async () => {
    db = (await import("@/lib/db")).getDb();
    stock = (await import("@/lib/commerce/inventory")).adjustInventory;
    publicApi = await import("@/lib/commerce/public"); validate = publicApi.validateCart;
    admin = (await import("@/lib/commerce/admin")).mutateCommerce;
    actorId = (await db.user.create({ data: { email: `${randomUUID()}@commerce.test`, passwordHash: "not-a-real-password" } })).id;
  });
  afterAll(async () => { await db?.$disconnect(); });
  const adjustment = (skuId: string, value = 20, kind = "INITIAL", expectedVersion = 0, requestId = randomUUID()) => ({ operation: "inventory", skuId, value, kind, expectedVersion, requestId, reason: "Verified physical count", confirmed: "yes" });
  async function fixture(initialize = true) {
    const product = await db.product.create({ data: { name: `Commerce-${randomUUID()}`, unit: "件", defaultPrice: 100, cost: 50 } });
    const sku = await db.productSku.create({ data: { id: product.id, productId: product.id, code: `DEFAULT-${product.id.toUpperCase()}`, combinationKey: "default" } });
    if (initialize) await stock(adjustment(sku.id), actorId);
    const groups = await Promise.all(["A", "B"].map((title) => db.groupBuy.create({ data: { title, slug: `gb-${randomUUID().replaceAll("-", "").slice(0, 16)}`, status: "PUBLISHED", publishedAt: new Date(), startAt: new Date(Date.now() - 10000), endAt: new Date(Date.now() + 86400000) } })));
    const offers = await Promise.all(groups.map((g, i) => db.groupBuySku.create({ data: { groupBuyId: g.id, skuId: sku.id, salePrice: i ? 279 : 299 } })));
    const cart = offers.map((o) => ({ offerId: o.id, quantity: 1, expectedPrice: o.salePrice }));
    return { product, sku, groups, offers, cart };
  }
  async function legacyFixture() {
    const f = await fixture(false);
    const item = await db.groupBuyItem.create({ data: { groupBuyId: f.groups[0].id, productId: f.product.id, salePrice: 111, cost: 50, stock: null } });
    const customer = await db.customer.create({ data: { phone: randomUUID() } });
    const createLegacy = () => db.order.create({ data: { publicCode: `ord-${randomUUID()}`, orderNumber: `20881018${String(++legacySequence).padStart(4, "0")}`, groupBuyId: f.groups[0].id, customerId: customer.id,
      status: "PLACED", customerName: "Original customer", customerPhone: "0912345678", totalAmount: 111,
      fulfillmentMethod: "SEVEN_ELEVEN", sevenElevenStoreId: "123456", sevenElevenStoreName: "Original store", sevenElevenStoreAddress: "Original address",
      items: { create: { groupBuyItemId: item.id, productName: "Historical snapshot", unit: "件", unitPrice: 111, quantity: 1 } } } });
    return { ...f, item, createLegacy };
  }
  test("unfulfilled legacy orders block switch; cancelled legacy snapshot and null stock survive", async () => {
    const f = await legacyFixture(); const order = await f.createLegacy();
    const before = await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    await expect(stock(adjustment(f.sku.id), actorId)).rejects.toThrow("未履約舊單");
    expect(await db.skuInventory.findUnique({ where: { skuId: f.sku.id } })).toBeNull();
    await db.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    await stock(adjustment(f.sku.id), actorId);
    expect(await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).toEqual(before);
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: f.item.id } })).stock).toBeNull();
    await expect(f.createLegacy()).rejects.toThrow();
  });
  test("concurrent legacy purchase and SKU switch cannot establish two authorities", async () => {
    const f = await legacyFixture();
    const r = await Promise.allSettled([stock(adjustment(f.sku.id), actorId), f.createLegacy()]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const managed = (await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).skuInventoryEnabled;
    const orders = await db.orderItem.count({ where: { groupBuyItemId: f.item.id } });
    if (!managed) expect(r[1].status).toBe("fulfilled");
    expect(managed ? orders === 0 : orders === 1).toBe(true);
    expect(await db.skuInventory.count({ where: { skuId: f.sku.id } })).toBe(managed ? 1 : 0);
  });
  test("one SKU across two groups has different prices and ONE physical balance; cart never reserves", async () => {
    const f = await fixture(); const result = await validate(f.cart);
    expect(result.total).toBe(578); expect(result.items.map((i) => i.available)).toEqual([20, 20]);
    expect(await db.skuInventory.count({ where: { skuId: f.sku.id } })).toBe(1);
    expect(await db.skuInventory.findUniqueOrThrow({ where: { skuId: f.sku.id } })).toMatchObject({ onHand: 20, reserved: 0, allocated: 0 });
  });
  test("cross-group demand is aggregated and cannot double available stock", async () => {
    const f = await fixture(); const result = await validate(f.cart.map((l) => ({ ...l, quantity: 15 })));
    expect(result.total).toBe(0); expect(result.items.every((i) => i.status?.includes("庫存不足"))).toBe(true);
  });
  test("unverified stock never becomes sellable, including legacy null/unlimited", async () => {
    const f = await fixture(false);
    await db.groupBuyItem.create({ data: { groupBuyId: f.groups[0].id, productId: f.product.id, salePrice: 299, cost: 50, stock: null } });
    const result = await validate(f.cart); expect(result.total).toBe(0); expect(result.items[0].status).toBe("庫存待盤點");
    expect(await db.skuInventory.count({ where: { skuId: f.sku.id } })).toBe(0);
  });
  test("parallel reduction uses row locks and stale version refusal, preserving ledger", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([stock(adjustment(f.sku.id, 15, "REDUCE", 1), actorId), stock(adjustment(f.sku.id, 15, "REDUCE", 1), actorId)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.skuInventory.findUniqueOrThrow({ where: { skuId: f.sku.id } })).toMatchObject({ onHand: 5, version: 2 });
    const ledger = await db.inventoryMovement.findMany({ where: { skuId: f.sku.id }, orderBy: { createdAt: "asc" } });
    expect(ledger).toHaveLength(2); expect(ledger[1]).toMatchObject({ beforeOnHand: 20, afterOnHand: 5, actorId });
    await expect(stock(adjustment(f.sku.id, 6, "REDUCE", 2), actorId)).rejects.toThrow();
    expect(await db.inventoryMovement.count({ where: { skuId: f.sku.id } })).toBe(2);
  });
  test("parallel count adjustments refuse stale count rather than lose updates", async () => {
    const f = await fixture(); const r = await Promise.allSettled([stock(adjustment(f.sku.id, 25, "COUNT", 1), actorId), stock(adjustment(f.sku.id, 30, "COUNT", 1), actorId)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.inventoryMovement.count({ where: { skuId: f.sku.id } })).toBe(2);
  });
  test("replayed stock requests are idempotent and mismatched payloads are refused", async () => {
    const f = await fixture(false); const input = adjustment(f.sku.id);
    const r = await Promise.all([stock(input, actorId), stock(input, actorId)]);
    expect(r[0].id).toBe(r[1].id);
    await expect(stock({ ...input, value: 50 }, actorId)).rejects.toThrow();
    expect(await db.inventoryMovement.count({ where: { skuId: f.sku.id } })).toBe(1);
  });
  test("paid allocated and checkout reserved stock cannot be counted out", async () => {
    const f = await fixture(); await db.skuInventory.update({ where: { skuId: f.sku.id }, data: { reserved: 4, allocated: 6 } });
    expect((await validate(f.cart)).items[0].available).toBe(10);
    await expect(stock(adjustment(f.sku.id, 9, "COUNT", 1), actorId)).rejects.toThrow();
    await expect(db.skuInventory.update({ where: { skuId: f.sku.id }, data: { onHand: -1 } })).rejects.toThrow();
  });
  test.each(["sku", "offer", "product"])("disabled %s invalidates saved cart", async (target) => {
    const f = await fixture();
    if (target === "sku") await db.productSku.update({ where: { id: f.sku.id }, data: { isActive: false } });
    if (target === "offer") await db.groupBuySku.updateMany({ where: { skuId: f.sku.id }, data: { isActive: false } });
    if (target === "product") await db.product.update({ where: { id: f.product.id }, data: { isActive: false } });
    const result = await validate(f.cart); expect(result.total).toBe(0); expect(result.items[0].status).toBe("已停售");
  });
  test.each(["ended", "unlisted", "archived"])("%s group retains cart line but blocks subtotal/public featured", async (state) => {
    const f = await fixture(); await db.groupBuy.update({ where: { id: f.groups[0].id }, data: { isFeatured: true,
      ...(state === "ended" ? { endAt: new Date(Date.now() - 1) } : state === "unlisted" ? { status: "CANCELLED" } : { isArchived: true }) } });
    const cart = await validate(f.cart); expect(cart.items).toHaveLength(2); expect(cart.items[0].subtotal).toBe(0); expect(cart.total).toBe(279);
    expect((await publicApi.listStorefront({ view: "featured" })).cards.some((g) => g.id === f.groups[0].id)).toBe(false);
    if (state !== "ended") expect(cart.items[0].label).toBe("無法購買的商品");
  });
  test("server rejects forged/outdated prices until customer accepts authoritative price", async () => {
    const f = await fixture(); await db.groupBuySku.update({ where: { id: f.offers[0].id }, data: { salePrice: 350 } });
    const r = await validate([{ ...f.cart[0], expectedPrice: 1 }]); expect(r.total).toBe(0); expect(r.items[0]).toMatchObject({ currentPrice: 350, status: "價格已變動" });
    expect((await validate([{ ...f.cart[0], expectedPrice: 350 }])).total).toBe(350);
  });
  test("purchase limit, missing offer, and sold out are not valid totals", async () => {
    const f = await fixture(); await db.groupBuySku.update({ where: { id: f.offers[0].id }, data: { purchaseLimit: 1 } });
    expect((await validate([{ ...f.cart[0], quantity: 2 }])).total).toBe(0);
    expect((await validate([{ ...f.cart[0], offerId: randomUUID() }])).items[0].status).toBe("商品已不存在");
    await stock(adjustment(f.sku.id, 0, "COUNT", 1), actorId);
    expect((await validate(f.cart)).items[0].status).toBe("已售完");
  });
  test("ledger append-only and referenced SKU identity protected", async () => {
    const f = await fixture(); const movement = await db.inventoryMovement.findFirstOrThrow({ where: { skuId: f.sku.id } });
    await expect(db.inventoryMovement.update({ where: { id: movement.id }, data: { reason: "forged" } })).rejects.toThrow();
    await expect(db.productSku.delete({ where: { id: f.sku.id } })).rejects.toThrow();
    await expect(db.productSku.update({ where: { id: f.sku.id }, data: { productId: randomUUID() } })).rejects.toThrow();
    await expect(db.product.update({ where: { id: f.product.id }, data: { skuInventoryEnabled: false } })).rejects.toThrow();
  });
  test("category admin, filtering, featured cap and shipping compatibility metadata", async () => {
    const category = await db.category.create({ data: { name: randomUUID() } });
    const fixtures = await Promise.all(Array.from({ length: 8 }, () => fixture()));
    for (const [i, f] of fixtures.entries()) await db.groupBuy.update({ where: { id: f.groups[0].id }, data: { categoryId: category.id, isFeatured: true, featuredSort: i } });
    const result = await publicApi.listStorefront({ category: category.id }); expect(result.featured).toHaveLength(6); expect(result.extraFeatured).toBe(true);
    expect(result.featured.map((g) => g.id)).toEqual(fixtures.slice(0, 6).map((f) => f.groups[0].id));
    const f = fixtures[0]; await db.productSku.update({ where: { id: f.sku.id }, data: { temperature: "FROZEN", shippingMethods: ["HOME_DELIVERY"], weightGrams: 500 } });
    expect((await validate(f.cart)).items[0].shipping).toMatchObject({ temperature: "FROZEN", methods: ["HOME_DELIVERY"], weightGrams: 500, allowsCombinedShipping: true });
    await admin({ operation: "category", id: category.id, name: "Renamed", sortOrder: 1, isActive: "false" }, actorId);
    expect((await publicApi.listStorefront({})).categories.some((c) => c.id === category.id)).toBe(false);
    await expect(db.category.delete({ where: { id: category.id } })).rejects.toThrow();
    expect((await db.groupBuy.findUniqueOrThrow({ where: { id: f.groups[0].id } })).categoryId).toBe(category.id);
  });
  test("SKU admin preserves reserved default code and forbids inactive category assignment", async () => {
    const f = await fixture(); const category = await db.category.create({ data: { name: randomUUID(), isActive: false } });
    await expect(admin({ operation: "group", id: f.groups[0].id, categoryId: category.id, visibility: "PUBLISHED", isFeatured: "false", featuredSort: 0, allowsCombinedShipping: "true" }, actorId)).rejects.toThrow();
    await expect(admin({ operation: "skuEdit", id: f.sku.id, code: "DEFAULT-FORGED", displayName: "", isActive: "true", temperature: "AMBIENT", shippingMethods: [], weightGrams: null, lengthMm: null, widthMm: null, heightMm: null, shippingNote: "" }, actorId)).rejects.toThrow();
  });
});
