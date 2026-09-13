// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { OrderDomainError } from "@/lib/orders/errors";
import {
  calculateOrderLineAmount,
  calculateOrderTotal,
  MAX_POSTGRES_INTEGER,
} from "@/lib/orders/money";

test.each([
  [0, 1, 0],
  [MAX_POSTGRES_INTEGER, 1, MAX_POSTGRES_INTEGER],
  [10, 3, 30],
])("calculates valid line %i x %i", (price, quantity, expected) => {
  expect(calculateOrderLineAmount(price, quantity)).toBe(expected);
});

test("rejects line multiplication overflow before converting back to Number", () => {
  expect(() => calculateOrderLineAmount(MAX_POSTGRES_INTEGER, 2))
    .toThrow(expect.objectContaining({ code: "INVALID_ORDER_INPUT" }));
});

test("uses BigInt for the running total and rejects aggregate overflow", () => {
  expect(calculateOrderTotal([
    { price: 1_000_000_000, quantity: 2 },
    { price: 147_483_647, quantity: 1 },
  ])).toBe(MAX_POSTGRES_INTEGER);
  expect(() => calculateOrderTotal([
    { price: 1_000_000_000, quantity: 2 },
    { price: 147_483_648, quantity: 1 },
  ])).toThrow(expect.objectContaining({ code: "INVALID_ORDER_INPUT" }));
});

test.each([
  [Number.MAX_SAFE_INTEGER, 1],
  [1.5, 1],
  [Number.NaN, 1],
  [Number.POSITIVE_INFINITY, 1],
  [-1, 1],
  [1, Number.MAX_SAFE_INTEGER],
  [1, 1.5],
  [1, Number.NaN],
  [1, Number.POSITIVE_INFINITY],
  [1, -1],
  [1, 0],
])("rejects invalid stored integer pair %#", (price, quantity) => {
  expect(() => calculateOrderLineAmount(price, quantity)).toThrow(OrderDomainError);
});

test("empty order total is zero", () => {
  expect(calculateOrderTotal([])).toBe(0);
});
