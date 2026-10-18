import { describe, test, expect } from "vitest";
import { shippingQuote, type ShippingLine } from "@/lib/checkout/shipping";
import { formatTaipeiOrderDate } from "@/lib/orders/order-number";
const rate = { id: "rate", method: "HOME_DELIVERY", temperature: "AMBIENT", enabled: true, fee: 70, freeThreshold: 500, maxWeightGrams: 1000, maxLengthMm: 100, maxWidthMm: 100, maxHeightMm: 100, capabilityEvidence: "verified", updatedAt: new Date() };
const line: ShippingLine = { offerId: "a", groupBuyId: "a", canCombine: true, endAt: new Date("2026-10-18T12:00:00Z"), quantity: 1, price: 300, temperature: "AMBIENT", methods: ["HOME_DELIVERY"], weightGrams: 100, lengthMm: 10, widthMm: 10, heightMm: 10, note: null };
describe("shipping compatibility and independent thresholds", () => {
    test("compatible groups combine and wait until latest close", () => { const quote = shippingQuote([line, { ...line, groupBuyId: "b", offerId: "b", endAt: new Date("2026-10-19T00:00:00Z") }], "HOME_DELIVERY", [rate]); expect(quote.shippingAmount).toBe(0); expect(quote.groups).toHaveLength(1); expect(quote.groups[0].waitUntil.toISOString()).toBe("2026-10-19T00:00:00.000Z"); });
    test("independent groups cannot pool free-shipping threshold", () => { const quote = shippingQuote([line, { ...line, groupBuyId: "b", offerId: "b", canCombine: false }], "HOME_DELIVERY", [rate]); expect(quote.shippingAmount).toBe(140); });
    test("temperature groups use separate rates", () => { const quote = shippingQuote([line, { ...line, groupBuyId: "b", offerId: "b", temperature: "FROZEN" }], "HOME_DELIVERY", [rate, { ...rate, id: "frozen", temperature: "FROZEN", fee: 150 }]); expect(quote.shippingAmount).toBe(220); });
    test.each([{ weightGrams: null }, { lengthMm: null }, { note: "玻璃特殊處理" }, { temperature: "CHILLED" }, { methods: [] }, { quantity: 11 }, { lengthMm: 101 }])("unknown or incompatible condition refuses checkout %j", change => { expect(() => shippingQuote([{ ...line, ...change }], "HOME_DELIVERY", [rate])).toThrow(); });
    test("Taipei numbering crosses date at 16:00 UTC", () => { expect(formatTaipeiOrderDate(new Date("2026-10-18T15:59:59Z"))).toBe("20261018"); expect(formatTaipeiOrderDate(new Date("2026-10-18T16:00:00Z"))).toBe("20261019"); });
});
