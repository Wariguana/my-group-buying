// @vitest-environment node

import { describe, expect, test } from "vitest";
import {
  getPublicGroupBuyLifecycle,
  publicGroupBuySlugSchema,
} from "@/lib/group-buys/public";

describe("public Group Buy slug validation", () => {
  test("accepts the generated non-UUID slug format", () => {
    expect(publicGroupBuySlugSchema.safeParse("gb-AbCdEf0123_-xyZ9").success).toBe(true);
  });

  test.each([
    "gb-short",
    "11111111-1111-4111-8111-111111111111",
    "gb-AbCdEf0123/xyZ99",
    "gb-AbCdEf0123%2FxyZ",
    "gb-AbCdEf0123.xyZ99",
  ])("rejects malformed or unexpected path input: %s", (slug) => {
    expect(publicGroupBuySlugSchema.safeParse(slug).success).toBe(false);
  });
});

describe("public Group Buy lifecycle", () => {
  const startAt = new Date("2026-09-09T02:00:00.000Z");
  const endAt = new Date("2026-09-10T02:00:00.000Z");

  test.each([
    [new Date("2026-09-09T01:59:59.999Z"), "scheduled"],
    [new Date("2026-09-09T02:00:00.000Z"), "active"],
    [new Date("2026-09-09T12:00:00.000Z"), "active"],
    [new Date("2026-09-10T02:00:00.000Z"), "ended"],
    [new Date("2026-09-10T02:00:00.001Z"), "ended"],
  ] as const)("derives %s as %s", (now, expected) => {
    expect(getPublicGroupBuyLifecycle(startAt, endAt, now)).toBe(expected);
  });
});
