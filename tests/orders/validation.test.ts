// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { orderInputSchema } from "@/lib/orders/validation";

const pickupId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const secondItemId = "33333333-3333-4333-8333-333333333333";

function validInput() {
  return {
    customerName: " 王小明 ",
    customerPhone: "0912-345-678",
    groupBuyPickupId: pickupId,
    items: [{ groupBuyItemId: itemId, quantity: 1 }],
  };
}

test("parses a minimal order and canonicalizes trusted output fields", () => {
  expect(orderInputSchema.parse(validInput())).toEqual({
    customerName: "王小明",
    customerPhone: "+886912345678",
    groupBuyPickupId: pickupId,
    items: [{ groupBuyItemId: itemId, quantity: 1 }],
  });
});

test("accepts distinct items", () => {
  expect(orderInputSchema.safeParse({
    ...validInput(),
    items: [
      { groupBuyItemId: itemId, quantity: 1 },
      { groupBuyItemId: secondItemId, quantity: 2 },
    ],
  }).success).toBe(true);
});

test.each([
  ["no items", { items: [] }],
  ["quantity zero", { items: [{ groupBuyItemId: itemId, quantity: 0 }] }],
  ["fractional quantity", { items: [{ groupBuyItemId: itemId, quantity: 1.5 }] }],
  ["invalid item UUID", { items: [{ groupBuyItemId: "not-a-uuid", quantity: 1 }] }],
  ["invalid pickup UUID", { groupBuyPickupId: "not-a-uuid" }],
  ["blank customer name", { customerName: " \t " }],
  ["invalid phone", { customerPhone: "+8860912345678" }],
  ["duplicate item", { items: [
    { groupBuyItemId: itemId, quantity: 1 },
    { groupBuyItemId: itemId, quantity: 2 },
  ] }],
])("rejects %s", (_label, change) => {
  expect(orderInputSchema.safeParse({ ...validInput(), ...change }).success).toBe(false);
});

test.each([
  "status",
  "publicCode",
  "customerId",
  "unitPrice",
  "totalAmount",
  "cost",
  "productId",
  "pickupLocationId",
  "productName",
  "unit",
  "pickupName",
  "pickupAddress",
  "pickupStartAt",
  "pickupEndAt",
  "cancelledAt",
  "createdAt",
  "updatedAt",
])("rejects injected server-authoritative top-level field %s", (field) => {
  expect(orderInputSchema.safeParse({ ...validInput(), [field]: "injected" }).success).toBe(false);
});

test.each(["unitPrice", "cost", "productId", "productName", "unit", "createdAt"])(
  "rejects injected server-authoritative item field %s",
  (field) => {
    expect(orderInputSchema.safeParse({
      ...validInput(),
      items: [{ ...validInput().items[0], [field]: "injected" }],
    }).success).toBe(false);
  },
);
