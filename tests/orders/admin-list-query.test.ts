// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ADMIN_ORDER_PAGE_SIZE,
  adminOrderListInputSchema,
  parseAdminOrderListSearchParams,
} from "@/lib/orders/admin-list-query";
import { buildAdminOrderListUrl } from "@/lib/orders/admin-list-url";

const orderNumber = "202610020001";
const publicCode = "ord-AbCdEf0123_-xyZ9";
const invalidQuery = { ok: false, error: "INVALID_QUERY" };

test("empty input has no hidden filters and a fixed 50-row page size", () => {
  expect(ADMIN_ORDER_PAGE_SIZE).toBe(50);
  expect(adminOrderListInputSchema.parse({})).toEqual({});
  expect(parseAdminOrderListSearchParams({})).toEqual({ ok: true, value: {} });
  expect(buildAdminOrderListUrl({})).toBe("/admin/orders");
});

test.each(["PLACED", "CANCELLED"] as const)("accepts status %s", (status) => {
  expect(adminOrderListInputSchema.parse({ status })).toEqual({ status });
});

test.each(["SELF_PICKUP", "SEVEN_ELEVEN"] as const)("accepts fulfillment %s", (fulfillment) => {
  expect(adminOrderListInputSchema.parse({ fulfillment })).toEqual({ fulfillment });
});

test.each(["UNPAID", "SELF_PICKUP_PENDING"] as const)("accepts queue %s", (queue) => {
  expect(adminOrderListInputSchema.parse({ queue })).toEqual({ queue });
});

test("full existing order-number pattern is accepted without calendar reinterpretation", () => {
  expect(adminOrderListInputSchema.parse({ orderNumber })).toEqual({ orderNumber });
  // The existing contract is exactly 12 ASCII digits, rather than a date parser.
  expect(adminOrderListInputSchema.safeParse({ orderNumber: "999999999999" }).success).toBe(true);
});

test.each([
  "", "20261002", "2026100200011", "20261002000a", "２０２６１００２０００１", 202610020001, null,
])("rejects a partial, malformed, or non-string order number %j", (value) => {
  expect(adminOrderListInputSchema.safeParse({ orderNumber: value }).success).toBe(false);
});

test.each([
  { queue: "UNPAID", status: "CANCELLED" },
  { queue: "SELF_PICKUP_PENDING", status: "CANCELLED" },
  { queue: "SELF_PICKUP_PENDING", fulfillment: "SEVEN_ELEVEN" },
])("contradictory conditions fail closed: %j", (input) => {
  expect(adminOrderListInputSchema.safeParse(input).success).toBe(false);
  expect(parseAdminOrderListSearchParams(input)).toEqual(invalidQuery);
});

test.each(["OLDER", "NEWER"] as const)("accepts only the complete %s navigation contract", (direction) => {
  const navigation = { direction, anchorPublicCode: publicCode };
  expect(adminOrderListInputSchema.parse({ navigation })).toEqual({ navigation });
});

test.each([
  null, true, [], "query", 123,
  { status: "ALL" }, { fulfillment: "SHIPPING" }, { queue: "PAID" },
  { navigation: {} },
  { navigation: { direction: "OLDER" } },
  { navigation: { direction: "OLD", anchorPublicCode: publicCode } },
  { navigation: { direction: ["OLDER", "NEWER"], anchorPublicCode: publicCode } },
  { navigation: { direction: "OLDER", anchorPublicCode: "bad" } },
  { navigation: { direction: "OLDER", anchorPublicCode: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } },
  { navigation: { direction: "OLDER", anchorPublicCode: publicCode, id: "internal-id" } },
  { navigation: { direction: "OLDER", anchorPublicCode: publicCode }, before: publicCode },
])("strict service schema rejects unsupported input %j", (input) => {
  expect(adminOrderListInputSchema.safeParse(input).success).toBe(false);
});

test.each([
  "customerName", "customerPhone", "groupBuyId", "shipmentRequired", "operationalState",
  "query", "page", "pageSize", "take", "skip", "cursor", "sort", "payment", "pickup",
])("does not reserve or silently ignore unsupported %s", (key) => {
  expect(adminOrderListInputSchema.safeParse({ [key]: "forged" }).success).toBe(false);
  expect(parseAdminOrderListSearchParams({ [key]: "forged" })).toEqual(invalidQuery);
});

test("URL parsing trims scalar form values and drops blank allowed filters", () => {
  expect(parseAdminOrderListSearchParams({
    orderNumber: ` ${orderNumber} `, status: " PLACED ", fulfillment: " SELF_PICKUP ", queue: " UNPAID ",
  })).toEqual({ ok: true, value: { orderNumber, status: "PLACED", fulfillment: "SELF_PICKUP", queue: "UNPAID" } });
  expect(parseAdminOrderListSearchParams({ orderNumber: "  ", status: "", fulfillment: "\t", queue: "" }))
    .toEqual({ ok: true, value: {} });
});

test.each(["orderNumber", "status", "fulfillment", "queue", "after", "before"])(
  "array/duplicate %s fails closed even when there is only one value",
  (key) => {
    for (const value of [[], [""], ["PLACED", "PLACED"], [publicCode]]) {
      expect(parseAdminOrderListSearchParams({ [key]: value })).toEqual(invalidQuery);
    }
  },
);

test.each(["orderNumber", "status", "fulfillment", "queue", "after", "before"])(
  "overlong or non-string %s fails closed",
  (key) => {
    for (const value of ["x".repeat(10_000), " ".repeat(10_000), null, 1, {}, true]) {
      expect(parseAdminOrderListSearchParams({ [key]: value })).toEqual(invalidQuery);
    }
  },
);

test.each([null, true, "query", 123, []])("invalid searchParams container %j fails safely", (params) => {
  expect(parseAdminOrderListSearchParams(params)).toEqual(invalidQuery);
});

test("only scalar framework RSC transport is ignored", () => {
  expect(parseAdminOrderListSearchParams({ orderNumber, _rsc: "framework" }))
    .toEqual({ ok: true, value: { orderNumber } });
  expect(parseAdminOrderListSearchParams({ _rsc: ["one", "two"] })).toEqual(invalidQuery);
  expect(parseAdminOrderListSearchParams({ _rsc: {} })).toEqual(invalidQuery);
  expect(parseAdminOrderListSearchParams({ _rsc: "x".repeat(10_000) })).toEqual(invalidQuery);
});

test("after and before are mutually exclusive, and public-code format is mandatory", () => {
  expect(parseAdminOrderListSearchParams({ after: publicCode, before: publicCode })).toEqual(invalidQuery);
  for (const key of ["after", "before"]) {
    expect(parseAdminOrderListSearchParams({ [key]: "bad" })).toEqual(invalidQuery);
    expect(parseAdminOrderListSearchParams({ [key]: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })).toEqual(invalidQuery);
  }
});

test.each([
  ["OLDER", "after"], ["NEWER", "before"],
] as const)("URL %s navigation retains allowed conditions without exposing sort keys", (direction, key) => {
  const input = {
    orderNumber, status: "PLACED" as const, fulfillment: "SELF_PICKUP" as const, queue: "UNPAID" as const,
    navigation: { direction, anchorPublicCode: publicCode },
  };
  const url = new URL(buildAdminOrderListUrl(input), "https://example.invalid");
  expect(url.pathname).toBe("/admin/orders");
  expect(Object.fromEntries(url.searchParams)).toEqual({ orderNumber, status: "PLACED", fulfillment: "SELF_PICKUP", queue: "UNPAID", [key]: publicCode });
  expect(url.search).not.toMatch(/id=|createdAt|customerName|customerPhone|_rsc/);
  expect(parseAdminOrderListSearchParams(Object.fromEntries(url.searchParams))).toEqual({ ok: true, value: input });
  const { navigation: removed, ...conditions } = input;
  expect(removed).toBeDefined();
  expect(new URL(buildAdminOrderListUrl(conditions), "https://example.invalid").searchParams.has(key)).toBe(false);
});
