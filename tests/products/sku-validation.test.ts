// @vitest-environment node
import { expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createProductSkuSchema, defaultSkuIdentity, skuCombinationKey } from "@/lib/products/sku-validation";

const first = "11111111-1111-4111-8111-111111111111";
const second = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("combination identity ignores selection order, case and mutable display labels", () => {
  expect(skuCombinationKey([second.toUpperCase(), first])).toBe(`${first},${second}`);
  expect(skuCombinationKey([])).toBe("default");
  expect(() => skuCombinationKey([first, first])).toThrow();
});

test("default identity is deterministic and reserves its code namespace", () => {
  expect(defaultSkuIdentity(second.toUpperCase())).toEqual({
    id: second, productId: second, code: `DEFAULT-${second.toUpperCase()}`, combinationKey: "default",
  });
  expect(createProductSkuSchema.safeParse({ code: "default-custom", optionValueIds: [first] }).success).toBe(false);
});

test("SKU input rejects unknown authority, duplicate choices, blank codes and empty variants", () => {
  expect(createProductSkuSchema.parse({ code: " shirt-black-s ", optionValueIds: [first] }).code).toBe("SHIRT-BLACK-S");
  for (const input of [
    { code: "SKU", optionValueIds: [first], stock: 999 },
    { code: "SKU", optionValueIds: [first, first] },
    { code: " ", optionValueIds: [first] },
    { code: "SKU", optionValueIds: [] },
  ]) expect(createProductSkuSchema.safeParse(input).success).toBe(false);
});
