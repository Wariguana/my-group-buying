// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createProductSchema, updateProductSchema } from "@/lib/products/validation";

const supplierId = "11111111-1111-4111-8111-111111111111";
const validInput = {
  name: "鳳梨酥",
  description: "十二入",
  imageUrl: "https://example.com/product.jpg",
  defaultPrice: "1200",
  cost: "800",
  unit: "盒",
  supplierId,
};

test("accepts and normalizes valid create and update input", () => {
  const expected = { ...validInput, defaultPrice: 1200, cost: 800 };
  expect(createProductSchema.parse(validInput)).toEqual(expected);
  expect(updateProductSchema.parse(validInput)).toEqual(expected);
});

test("trims required text and rejects blank name or unit", () => {
  expect(createProductSchema.parse({ ...validInput, name: "  鳳梨 酥  ", unit: "  盒  " }))
    .toEqual(expect.objectContaining({ name: "鳳梨 酥", unit: "盒" }));
  expect(createProductSchema.safeParse({ ...validInput, name: " \t " }).success).toBe(false);
  expect(createProductSchema.safeParse({ ...validInput, unit: " \n " }).success).toBe(false);
});

test("turns blank optional text and image URL into null while preserving internal whitespace", () => {
  const parsed = createProductSchema.parse({ ...validInput, description: " ", imageUrl: "\t" });
  expect(parsed.description).toBeNull();
  expect(parsed.imageUrl).toBeNull();
  expect(createProductSchema.parse({ ...validInput, description: "  外酥  內軟  " }).description)
    .toBe("外酥  內軟");
});

test.each([
  "http://example.com/image.jpg",
  "https://example.com/image.jpg",
])("accepts absolute HTTP image URL %s", (imageUrl) => {
  expect(createProductSchema.safeParse({ ...validInput, imageUrl }).success).toBe(true);
});

test.each([
  "not a url",
  "/relative/image.jpg",
  "javascript:alert(1)",
  "data:image/png;base64,abc",
  "file:///tmp/image.jpg",
  "ftp://example.com/image.jpg",
])("rejects malformed, relative, or non-HTTP image URL %s", (imageUrl) => {
  expect(createProductSchema.safeParse({ ...validInput, imageUrl }).success).toBe(false);
});

test.each(["0", "1", "2147483647", " 1200 "])("accepts valid integer TWD amount %s", (amount) => {
  const parsed = createProductSchema.parse({ ...validInput, defaultPrice: amount, cost: amount });
  expect(parsed.defaultPrice).toBe(Number(amount.trim()));
  expect(parsed.cost).toBe(Number(amount.trim()));
});

test.each([
  "2147483648",
  "-1",
  "1.5",
  "1e3",
  "1,000",
  "NaN",
  "Infinity",
  "twelve",
])("rejects invalid integer TWD amount %s", (amount) => {
  expect(createProductSchema.safeParse({ ...validInput, defaultPrice: amount }).success).toBe(false);
  expect(createProductSchema.safeParse({ ...validInput, cost: amount }).success).toBe(false);
});

test("normalizes, accepts, and rejects Supplier IDs as specified", () => {
  expect(createProductSchema.parse({ ...validInput, supplierId: "" }).supplierId).toBeNull();
  expect(createProductSchema.parse({ ...validInput, supplierId }).supplierId).toBe(supplierId);
  expect(createProductSchema.safeParse({ ...validInput, supplierId: "not-a-uuid" }).success).toBe(false);
});

test.each([
  "id",
  "isActive",
  "createdAt",
  "updatedAt",
  "groupBuyItems",
  "supplier",
  "arbitrary",
])("strictly rejects injected %s field", (field) => {
  expect(createProductSchema.safeParse({ ...validInput, [field]: "untrusted" }).success).toBe(false);
  expect(updateProductSchema.safeParse({ ...validInput, [field]: "untrusted" }).success).toBe(false);
});
