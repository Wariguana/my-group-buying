import { expect, test } from "vitest";
import { cartSchema } from "@/lib/commerce/validation";
import { CART_KEY, loadCart, saveCart, removeAcknowledgedCartLines } from "@/lib/commerce/cart-storage";
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
test("cart round trips across reload/OAuth without user data", () => {
  const storage = new Map<string, string>();
  saveCart({ setItem: (key, value) => storage.set(key, value) }, [{ offerId: a, quantity: 2, expectedPrice: 299 }, { offerId: b, quantity: 3, expectedPrice: 279 }]);
  expect(loadCart({ getItem: (key) => storage.get(key) ?? null })).toHaveLength(2);
  expect([...storage.keys()]).toEqual([CART_KEY]);
});
test.each([null, {}, [{ offerId: a, quantity: 1, expectedPrice: 1, userId: a }], [{ offerId: a, quantity: -1, expectedPrice: 1 }], [{ offerId: a, quantity: 1.5, expectedPrice: 1 }], [{ offerId: a, quantity: 1, expectedPrice: Infinity }], [{ offerId: a, quantity: "1", expectedPrice: 1 }], [{ offerId: a, quantity: true, expectedPrice: null }], [{ offerId: a, quantity: 1, expectedPrice: 1 }, { offerId: a, quantity: 2, expectedPrice: 1 }]])("rejects malformed or forged shape %j", (data) => {
  expect(cartSchema.safeParse(data).success).toBe(false);
});
test("oversized and corrupt persistence fails without overwriting it", () => {
  expect(() => loadCart({ getItem: () => "x".repeat(32001) })).toThrow();
  expect(() => loadCart({ getItem: () => "broken json" })).toThrow();
});

test("acknowledged purchase clears matching lines but preserves concurrent cart changes", () => {
  const storage = new Map<string, string>();
  const adapter = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } };
  const purchased = [{ offerId: a, quantity: 1, expectedPrice: 299 }];
  saveCart(adapter, [...purchased, { offerId: b, quantity: 1, expectedPrice: 279 }]);
  removeAcknowledgedCartLines(adapter, purchased);
  expect(loadCart(adapter)).toEqual([{ offerId: b, quantity: 1, expectedPrice: 279 }]);
  saveCart(adapter, [{ ...purchased[0], quantity: 2 }]);
  removeAcknowledgedCartLines(adapter, purchased);
  expect(loadCart(adapter)).toEqual([{ ...purchased[0], quantity: 2 }]);
});
