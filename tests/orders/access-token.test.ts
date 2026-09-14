// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  generateOrderAccessToken,
  hashOrderAccessToken,
  isValidOrderAccessToken,
} from "@/lib/orders/access-token";

test("generates an unpadded 43-character base64url token from 32 random bytes", () => {
  const token = generateOrderAccessToken();
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(Buffer.from(token, "base64url")).toHaveLength(32);
  expect(token).not.toContain("=");
});

test.each([
  "A".repeat(42),
  "A".repeat(44),
  `${"A".repeat(42)}=`,
  `${"A".repeat(42)}+`,
  `${"A".repeat(42)}/`,
  "管理碼".repeat(15),
  null,
  undefined,
  123,
])("rejects a token outside the exact base64url contract: %s", (value) => {
  expect(isValidOrderAccessToken(value)).toBe(false);
});

test("accepts every base64url alphabet edge at exactly 43 characters", () => {
  expect(isValidOrderAccessToken(`${"A".repeat(40)}0_-`)).toBe(true);
});

test("hashing is deterministic lowercase SHA-256 hex and differs from raw input", () => {
  const token = "A".repeat(43);
  const first = hashOrderAccessToken(token);
  expect(first).toBe(hashOrderAccessToken(token));
  expect(first).toMatch(/^[a-f0-9]{64}$/);
  expect(first).not.toBe(token);
});
