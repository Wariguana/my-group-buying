// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createOrderPublicCodeGenerator,
  generateOrderPublicCode,
  ORDER_PUBLIC_CODE_PATTERN,
} from "@/lib/orders/public-code";

test("generates a 20-character ord- code with 16 base64url characters", () => {
  const code = generateOrderPublicCode();
  expect(code).toHaveLength(20);
  expect(code.startsWith("ord-")).toBe(true);
  expect(code).toMatch(ORDER_PUBLIC_CODE_PATTERN);
});

test("normal generations all satisfy the format contract", () => {
  const codes = Array.from({ length: 20 }, generateOrderPublicCode);
  expect(codes).toHaveLength(20);
  expect(codes.every((code) => ORDER_PUBLIC_CODE_PATTERN.test(code))).toBe(true);
});

test("supports a deterministic 12-byte random source", () => {
  const source = vi.fn(() => Uint8Array.from({ length: 12 }, (_, index) => index));
  const generate = createOrderPublicCodeGenerator(source);
  expect(generate()).toBe("ord-AAECAwQFBgcICQoL");
  expect(source).toHaveBeenCalledExactlyOnceWith(12);
});
