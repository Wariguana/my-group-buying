// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  tx: {
    $queryRaw: vi.fn(),
    customerAccount: { findUnique: vi.fn() },
    checkout: { findUnique: vi.fn(), create: vi.fn() },
    groupBuySku: { findMany: vi.fn() },
    checkoutSettings: { findUnique: vi.fn() },
    shippingRate: { findMany: vi.fn() },
    verifiedPickupStore: { findFirst: vi.fn() },
  },
  transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getDb: () => ({ $transaction: mocks.transaction }) }));
import { createCheckout } from "@/lib/checkout/service";

const owner = randomUUID();
const groupBuyId = randomUUID();
const skuId = randomUUID();
const offerId = randomUUID();
const productId = randomUUID();
const storeId = randomUUID();
const input = {
  requestId: randomUUID(), customerName: "測試", customerPhone: "0912345678",
  lines: [{ offerId, quantity: 1, expectedPrice: 100 }],
  method: "HOME_DELIVERY", address: "台北市測試區測試路 1 號",
};

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("QBUY_ENV", "test");
  for (const flag of ["CHECKOUT", "BANK_DETAILS", "HOME_DELIVERY", "FAMILY_MART"])
    vi.stubEnv(`QBUY_ENABLE_${flag}`, "true");
  mocks.transaction.mockImplementation((run) => run(mocks.tx));
  mocks.tx.customerAccount.findUnique.mockResolvedValue({ id: owner });
  mocks.tx.checkout.findUnique.mockResolvedValue(null);
  mocks.tx.checkoutSettings.findUnique.mockResolvedValue({ enabled: true });
  mocks.tx.groupBuySku.findMany.mockResolvedValue([{
    id: offerId, groupBuyId, skuId, isActive: true, salePrice: 100, purchaseLimit: null,
    groupBuy: { title: "測試團", status: "PUBLISHED", isArchived: false,
      startAt: new Date(0), endAt: new Date(Date.now() + 3600000), allowsCombinedShipping: true },
    sku: { productId, isActive: true, temperature: "AMBIENT", shippingMethods: ["HOME_DELIVERY", "FAMILY_MART"],
      weightGrams: 100, lengthMm: 10, widthMm: 10, heightMm: 10, shippingNote: null,
      product: { name: "商品", isActive: true, skuInventoryEnabled: true },
      inventory: { onHand: 5, reserved: 0, allocated: 0 } },
  }]);
  mocks.tx.shippingRate.findMany.mockResolvedValue(["HOME_DELIVERY", "FAMILY_MART"].map(method => ({
    id: method, method, temperature: "AMBIENT", enabled: true, fee: 60, freeThreshold: null,
    maxWeightGrams: 1000, maxLengthMm: 100, maxWidthMm: 100, maxHeightMm: 100,
  })));
  mocks.tx.verifiedPickupStore.findFirst.mockResolvedValue({ id: storeId, code: "TEST", name: "測試門市", address: input.address });
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

test.each(["HOME_DELIVERY", "FAMILY_MART"])("%s quotes use one consistent snapshot without locking rows or reserving stock", async method => {
  const quote = await createCheckout({ ...input, method, ...(method === "FAMILY_MART" ? { familyStoreId: storeId } : {}) }, owner, "", true);
  expect(quote).toMatchObject({ id: null, subtotal: 100, shippingAmount: 60, totalAmount: 160 });
  expect(quote.quoteFingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15000, isolationLevel: "RepeatableRead" });
  expect(mocks.tx.$queryRaw).not.toHaveBeenCalled();
  expect(mocks.tx.groupBuySku.findMany).toHaveBeenCalledTimes(1);
  expect(mocks.tx.checkout.create).not.toHaveBeenCalled();
});

test("actual checkout retains the lock order and rejects a changed quote before creating anything", async () => {
  await expect(createCheckout({ ...input, quoteFingerprint: "0".repeat(64) }, owner)).rejects.toThrow("報價已變更");
  expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15000 });
  const statements = mocks.tx.$queryRaw.mock.calls.map(([strings]) => strings.join("?"));
  expect(statements.map(sql => sql.match(/FROM "([^"]+)"/)?.[1])).toEqual([
    "CustomerAccount", "Product", "GroupBuy", "GroupBuySku", "ProductSku", "CheckoutSettings", "ShippingRate",
  ]);
  expect(statements[0]).toContain("FOR UPDATE");
  expect(statements[1]).toContain("FOR UPDATE");
  expect(statements.slice(2).every(sql => sql.includes("FOR SHARE"))).toBe(true);
  expect(mocks.tx.checkout.create).not.toHaveBeenCalled();
});
