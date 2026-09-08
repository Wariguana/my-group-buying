// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPickupLocationSchema,
  updatePickupLocationSchema,
} from "@/lib/pickup-locations/validation";

const validInput = {
  name: "中山取貨點",
  address: "台北市中山區中山北路一段 1 號",
  description: "請由側門進入",
};

test("accepts valid create and update input", () => {
  expect(createPickupLocationSchema.parse(validInput)).toEqual(validInput);
  expect(updatePickupLocationSchema.parse(validInput)).toEqual(validInput);
});

test("trims the name and rejects blank names", () => {
  expect(createPickupLocationSchema.parse({ ...validInput, name: "  中山 取貨點  " }).name)
    .toBe("中山 取貨點");
  expect(createPickupLocationSchema.safeParse({ ...validInput, name: " \t " }).success).toBe(false);
});

test("trims the address, preserves internal whitespace, and rejects blank addresses", () => {
  expect(createPickupLocationSchema.parse({ ...validInput, address: "  台北市  中山區  " }).address)
    .toBe("台北市  中山區");
  expect(createPickupLocationSchema.safeParse({ ...validInput, address: " \n " }).success).toBe(false);
});

test("trims description, preserves internal content, and converts blank to null", () => {
  expect(createPickupLocationSchema.parse({ ...validInput, description: "  側門  進入\n二樓取貨  " }).description)
    .toBe("側門  進入\n二樓取貨");
  expect(createPickupLocationSchema.parse({ ...validInput, description: " \t " }).description).toBeNull();
});

test.each([
  "unknown",
  "id",
  "isActive",
  "createdAt",
  "updatedAt",
  "groupBuyPickups",
])("strictly rejects injected %s field", (field) => {
  expect(createPickupLocationSchema.safeParse({ ...validInput, [field]: "untrusted" }).success).toBe(false);
  expect(updatePickupLocationSchema.safeParse({ ...validInput, [field]: "untrusted" }).success).toBe(false);
});
