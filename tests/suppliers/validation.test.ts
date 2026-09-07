// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createSupplierSchema, updateSupplierSchema } from "@/lib/suppliers/validation";

const validInput = {
  name: "供應商甲",
  contactName: "王小明",
  phone: "+886 912-345-678",
  lineContact: "Line ID: Supplier-A",
  note: "週一至週五聯絡",
};

test("accepts valid create and update input", () => {
  expect(createSupplierSchema.parse(validInput)).toEqual(validInput);
  expect(updateSupplierSchema.parse(validInput)).toEqual(validInput);
});

test("trims the supplier name and rejects blank names", () => {
  expect(createSupplierSchema.parse({ ...validInput, name: "  供應商甲  " }).name).toBe("供應商甲");
  expect(createSupplierSchema.safeParse({ ...validInput, name: " \t " }).success).toBe(false);
});

test("converts blank optional strings to null", () => {
  const parsed = createSupplierSchema.parse({
    name: "供應商甲",
    contactName: " ",
    phone: "\t",
    lineContact: "  ",
    note: "\n",
  });
  expect(parsed).toEqual({
    name: "供應商甲",
    contactName: null,
    phone: null,
    lineContact: null,
    note: null,
  });
});

test.each([
  ["contactName", "  王 小明  ", "王 小明"],
  ["phone", "  +886 (02) 1234-5678  ", "+886 (02) 1234-5678"],
  ["lineContact", "  Line ID: AbC_123  ", "Line ID: AbC_123"],
  ["note", "  保留  內部空白與大小寫 AbC  ", "保留  內部空白與大小寫 AbC"],
] as const)("preserves %s except for surrounding whitespace", (field, value, expected) => {
  const parsed = createSupplierSchema.parse({ ...validInput, [field]: value });
  expect(parsed[field]).toBe(expected);
});

test.each(["unknown", "id", "isActive", "createdAt", "updatedAt", "products"])(
  "strictly rejects injected %s field",
  (field) => {
    expect(createSupplierSchema.safeParse({ ...validInput, [field]: "untrusted" }).success).toBe(false);
    expect(updateSupplierSchema.safeParse({ ...validInput, [field]: "untrusted" }).success).toBe(false);
  },
);
