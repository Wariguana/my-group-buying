// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createGroupBuyDraftSchema,
  groupBuyNullableIntegerSchema,
  groupBuySalePriceSchema,
  updateGroupBuyDraftSchema,
} from "@/lib/group-buys/validation";
import { formatTaipeiDateTimeLocal, parseTaipeiDateTimeLocal } from "@/lib/group-buys/time";

const productId = "11111111-1111-4111-8111-111111111111";
const productId2 = "22222222-2222-4222-8222-222222222222";
const pickupId = "33333333-3333-4333-8333-333333333333";
const pickupId2 = "44444444-4444-4444-8444-444444444444";

function validInput() {
  return {
    title: "  中秋團購  ",
    description: "  保留內文  ",
    coverImageUrl: " https://example.com/cover.jpg ",
    startAt: "2026-09-01T10:00",
    endAt: "2026-09-02T10:00",
    items: [{ productId, salePrice: "100", stock: "", purchaseLimit: "0" }],
    pickups: [{ pickupLocationId: pickupId, pickupStartAt: "", pickupEndAt: "" }],
  };
}

test("normalizes draft text, URL, and Taiwan datetime-local values", () => {
  const value = createGroupBuyDraftSchema.parse(validInput());
  expect(value).toMatchObject({ title: "中秋團購", description: "保留內文", coverImageUrl: "https://example.com/cover.jpg" });
  expect(value.startAt.toISOString()).toBe("2026-09-01T02:00:00.000Z");
  expect(value.endAt.toISOString()).toBe("2026-09-02T02:00:00.000Z");
  expect(formatTaipeiDateTimeLocal(value.startAt)).toBe("2026-09-01T10:00");
});

test("blank optional text becomes null and blank title is rejected", () => {
  expect(createGroupBuyDraftSchema.parse({ ...validInput(), description: " ", coverImageUrl: "" })).toMatchObject({ description: null, coverImageUrl: null });
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), title: "  " }).success).toBe(false);
});

test.each(["http://example.com/a.jpg", "https://example.com/a.jpg"])("accepts cover URL %s", (coverImageUrl) => {
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), coverImageUrl }).success).toBe(true);
});

test.each(["/relative.jpg", "http:example.com/a.jpg", "javascript:alert(1)", "data:image/png;base64,x", "file:///tmp/a", "ftp://example.com/a", "not a url"])("rejects cover URL %s", (coverImageUrl) => {
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), coverImageUrl }).success).toBe(false);
});

test("accepts past draft windows and requires strictly increasing timestamps", () => {
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), startAt: "2020-01-01T00:00", endAt: "2020-01-02T00:00" }).success).toBe(true);
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), endAt: "2026-09-01T10:00" }).success).toBe(false);
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), endAt: "2026-08-31T10:00" }).success).toBe(false);
  expect(parseTaipeiDateTimeLocal("2026-02-30T10:00")).toBeNull();
});

test("rejects duplicate Product and PickupLocation IDs", () => {
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), items: [validInput().items[0], validInput().items[0]] }).success).toBe(false);
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), pickups: [validInput().pickups[0], validInput().pickups[0]] }).success).toBe(false);
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), items: [{ ...validInput().items[0], productId: productId2 }], pickups: [{ ...validInput().pickups[0], pickupLocationId: pickupId2 }] }).success).toBe(true);
});

test.each([null, "", "0", "2147483647"])("nullable integer accepts %j", (value) => {
  expect(groupBuyNullableIntegerSchema.safeParse(value).success).toBe(true);
});

test.each(["-1", "1.5", "1e3", "1,000", "2147483648", Number.NaN, Number.POSITIVE_INFINITY])("nullable integer rejects %j", (value) => {
  expect(groupBuyNullableIntegerSchema.safeParse(value).success).toBe(false);
});

test.each(["0", "2147483647", 50])("salePrice accepts %j", (value) => {
  expect(groupBuySalePriceSchema.safeParse(value).success).toBe(true);
});

test.each(["-1", "1.5", "1e3", "1,000", "2147483648", "", Number.NaN, Number.POSITIVE_INFINITY])("salePrice rejects %j", (value) => {
  expect(groupBuySalePriceSchema.safeParse(value).success).toBe(false);
});

test("validates stock and purchaseLimit independently with blank meaning null and zero preserved", () => {
  const parsed = createGroupBuyDraftSchema.parse(validInput());
  expect(parsed.items[0]).toMatchObject({ stock: null, purchaseLimit: 0, salePrice: 100 });
  for (const field of ["stock", "purchaseLimit"] as const) {
    for (const invalid of ["-1", "1.2", "1e3", "1,000", "2147483648"]) {
      const input = validInput();
      input.items[0][field] = invalid;
      expect(createGroupBuyDraftSchema.safeParse(input).success).toBe(false);
    }
  }
});

test("pickup windows are both-null or a strictly increasing pair", () => {
  expect(createGroupBuyDraftSchema.safeParse(validInput()).success).toBe(true);
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), pickups: [{ pickupLocationId: pickupId, pickupStartAt: "2026-09-03T10:00", pickupEndAt: "2026-09-03T11:00" }] }).success).toBe(true);
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), pickups: [{ pickupLocationId: pickupId, pickupStartAt: "2026-09-03T10:00", pickupEndAt: "" }] }).success).toBe(false);
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), pickups: [{ pickupLocationId: pickupId, pickupStartAt: "", pickupEndAt: "2026-09-03T11:00" }] }).success).toBe(false);
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), pickups: [{ pickupLocationId: pickupId, pickupStartAt: "2026-09-03T10:00", pickupEndAt: "2026-09-03T10:00" }] }).success).toBe(false);
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), pickups: [{ pickupLocationId: pickupId, pickupStartAt: "2026-09-03T11:00", pickupEndAt: "2026-09-03T10:00" }] }).success).toBe(false);
});

test("allows zero-item and zero-pickup drafts", () => {
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), items: [], pickups: [] }).success).toBe(true);
});

test.each([
  ["top-level status", { status: "PUBLISHED" }],
  ["top-level slug", { slug: "client-slug" }],
  ["top-level publishedAt", { publishedAt: null }],
  ["item cost", { items: [{ ...validInput().items[0], cost: 1 }] }],
  ["item unknown field", { items: [{ ...validInput().items[0], sortOrder: 99 }] }],
  ["pickup unknown field", { pickups: [{ ...validInput().pickups[0], id: pickupId }] }],
] as const)("strict schemas reject %s injection", (_name, injected) => {
  expect(updateGroupBuyDraftSchema.safeParse({ ...validInput(), ...injected }).success).toBe(false);
});
