import { describe, expect, test } from "vitest";

import {
  formatOrderNumber,
  formatTaipeiOrderDate,
  ORDER_NUMBER_PATTERN,
} from "@/lib/orders/order-number";

describe("human-readable Order numbers", () => {
  test.each([
    ["2026-09-16T15:59:59.999Z", "20260916"],
    ["2026-09-16T16:00:00.000Z", "20260917"],
  ])("formats %s using the Asia/Taipei business date", (instant, expected) => {
    expect(formatTaipeiOrderDate(new Date(instant))).toBe(expected);
  });

  test.each([
    [1, "202609170001"],
    [48, "202609170048"],
    [9999, "202609179999"],
  ])("formats daily sequence %s", (sequence, expected) => {
    const value = formatOrderNumber("20260917", sequence);
    expect(value).toBe(expected);
    expect(value).toMatch(ORDER_NUMBER_PATTERN);
  });

  test.each([0, 10_000, -1, 1.5])("rejects sequence overflow or invalid value %s", (sequence) => {
    expect(() => formatOrderNumber("20260917", sequence)).toThrow(RangeError);
  });
});
