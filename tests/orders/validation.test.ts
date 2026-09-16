// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { orderInputSchema } from "@/lib/orders/validation";

const pickupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const itemId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const secondItemId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function validInput() {
  return {
    customerName: " 王小明 ",
    customerPhone: "0912-345-678",
    groupBuyPickupId: pickupId,
    items: [{ groupBuyItemId: itemId, expectedUnitPrice: 150, quantity: 1 }],
  };
}

test("parses a minimal order and canonicalizes trusted output fields", () => {
  expect(orderInputSchema.parse(validInput())).toEqual({
    customerName: "王小明",
    customerPhone: "+886912345678",
    fulfillmentMethod: "SELF_PICKUP",
    groupBuyPickupId: pickupId,
    items: [{ groupBuyItemId: itemId, expectedUnitPrice: 150, quantity: 1 }],
  });
});

test("7-ELEVEN input accepts only an opaque selection token and rejects browser store fields", () => {
  const sevenEleven = {
    customerName: "王小明",
    customerPhone: "0912-345-678",
    fulfillmentMethod: "SEVEN_ELEVEN",
    storeSelectionToken: "A".repeat(43),
    items: [{ groupBuyItemId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", expectedUnitPrice: 150, quantity: 1 }],
  };
  expect(orderInputSchema.safeParse(sevenEleven).success).toBe(true);
  expect(orderInputSchema.safeParse({ ...sevenEleven, CVSStoreID: "999999", CVSStoreName: "偽造門市", CVSAddress: "偽造地址" }).success).toBe(false);
});

test("accepts distinct items", () => {
  expect(orderInputSchema.safeParse({
    ...validInput(),
    items: [
      { groupBuyItemId: itemId, expectedUnitPrice: 150, quantity: 1 },
      { groupBuyItemId: secondItemId, expectedUnitPrice: 250, quantity: 2 },
    ],
  }).success).toBe(true);
});

test("canonicalizes uppercase UUID selectors to lowercase", () => {
  expect(pickupId.toUpperCase()).not.toBe(pickupId);
  expect(itemId.toUpperCase()).not.toBe(itemId);
  expect(orderInputSchema.parse({
    ...validInput(),
    groupBuyPickupId: pickupId.toUpperCase(),
    items: [{ groupBuyItemId: itemId.toUpperCase(), expectedUnitPrice: 150, quantity: 1 }],
  })).toMatchObject({
    groupBuyPickupId: pickupId,
    items: [{ groupBuyItemId: itemId, expectedUnitPrice: 150, quantity: 1 }],
  });
});

test("rejects case-variant duplicate GroupBuyItem IDs", () => {
  expect(itemId.toUpperCase()).not.toBe(itemId);
  expect(orderInputSchema.safeParse({
    ...validInput(),
    items: [
      { groupBuyItemId: itemId, expectedUnitPrice: 150, quantity: 1 },
      { groupBuyItemId: itemId.toUpperCase(), expectedUnitPrice: 150, quantity: 2 },
    ],
  }).success).toBe(false);
});

test.each([
  ["no items", { items: [] }],
  ["quantity zero", { items: [{ groupBuyItemId: itemId, expectedUnitPrice: 150, quantity: 0 }] }],
  ["fractional quantity", { items: [{ groupBuyItemId: itemId, expectedUnitPrice: 150, quantity: 1.5 }] }],
  ["missing expected price", { items: [{ groupBuyItemId: itemId, quantity: 1 }] }],
  ["negative expected price", { items: [{ groupBuyItemId: itemId, expectedUnitPrice: -1, quantity: 1 }] }],
  ["fractional expected price", { items: [{ groupBuyItemId: itemId, expectedUnitPrice: 1.5, quantity: 1 }] }],
  ["invalid item UUID", { items: [{ groupBuyItemId: "not-a-uuid", expectedUnitPrice: 150, quantity: 1 }] }],
  ["invalid pickup UUID", { groupBuyPickupId: "not-a-uuid" }],
  ["blank customer name", { customerName: " \t " }],
  ["invalid phone", { customerPhone: "+8860912345678" }],
  ["duplicate item", { items: [
    { groupBuyItemId: itemId, expectedUnitPrice: 150, quantity: 1 },
    { groupBuyItemId: itemId, expectedUnitPrice: 150, quantity: 2 },
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
