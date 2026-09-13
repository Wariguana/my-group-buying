// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CANONICAL_TAIWAN_MOBILE_PATTERN,
  canonicalizeTaiwanMobilePhone,
} from "@/lib/orders/phone";

test.each([
  "0912345678",
  "0912-345-678",
  "0912 345 678",
  "+886912345678",
  "+886 912 345 678",
  " \t0912-345-678\r\n",
])("canonicalizes accepted mobile number %j", (input) => {
  const canonical = canonicalizeTaiwanMobilePhone(input);
  expect(canonical).toBe("+886912345678");
  expect(canonical).toMatch(CANONICAL_TAIWAN_MOBILE_PATTERN);
});

test.each([
  "886912345678",
  "+8860912345678",
  "912345678",
  "0212345678",
  "0312345678",
  "+14155552671",
  "09abcdefgh",
  "０９１２３４５６７８",
  "091234567",
  "09123456789",
  "",
  "   ",
  "0912\t345678",
])("rejects invalid mobile number %j", (input) => {
  expect(canonicalizeTaiwanMobilePhone(input)).toBeNull();
});
