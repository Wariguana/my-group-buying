// @vitest-environment node

import { expect, test } from "vitest";
import { formatTaipeiDisplayDateTime } from "@/lib/group-buys/time";

test("formats a Taipei datetime with deterministic ASCII separators", () => {
  const formatted = formatTaipeiDisplayDateTime(new Date("2026-10-03T18:18:00.000Z"));

  expect(formatted).toBe("2026/10/04 02:18");
  expect(formatted.charCodeAt(10)).toBe(0x20);
  expect(formatted).not.toMatch(/[\u00a0\u2007\u2009\u202f]/u);
});
