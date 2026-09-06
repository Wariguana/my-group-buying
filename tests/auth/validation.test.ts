// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  adminEmailSchema,
  adminPasswordSchema,
  firstAdminInputSchema,
} from "@/lib/auth/validation";

test("trims and lowercases email", () => {
  expect(adminEmailSchema.parse(" ADMIN@Example.COM ")).toBe("admin@example.com");
});

test.each(["", "   ", "invalid", "admin@", "@example.com", "a b@example.com", null, 123])(
  "rejects invalid email case %#", (email) => {
    expect(adminEmailSchema.safeParse(email).success).toBe(false);
  },
);

test.each([[11, false], [12, true], [128, true], [129, false]] as const)(
  "validates password length %i", (length, accepted) => {
    expect(adminPasswordSchema.safeParse("a".repeat(length)).success).toBe(accepted);
  },
);

test.each([null, undefined, 123, {}, []])("rejects non-string password case %#", (input) => {
  expect(adminPasswordSchema.safeParse(input).success).toBe(false);
});

test("preserves whitespace, including when it contributes to the minimum length", () => {
  const value = ` ${"a".repeat(10)} `;
  expect(adminPasswordSchema.parse(value)).toBe(value);
  expect(adminPasswordSchema.safeParse(value.trim()).success).toBe(false);
  const plain = "a".repeat(12);
  expect(adminPasswordSchema.parse(` ${plain} `)).not.toBe(adminPasswordSchema.parse(plain));
});

test("preserves case without complexity rules", () => {
  const value = "Aa".repeat(6);
  expect(adminPasswordSchema.parse(value)).toBe(value);
  expect(adminPasswordSchema.parse(value)).not.toBe(value.toLowerCase());
  expect(adminPasswordSchema.parse(" ".repeat(12))).toBe(" ".repeat(12));
});

test("preserves Unicode without normalization", () => {
  const decomposed = "e\u0301".repeat(12);
  expect(adminPasswordSchema.parse(decomposed)).toBe(decomposed);
  expect(adminPasswordSchema.parse(decomposed)).not.toBe(decomposed.normalize("NFC"));
});

test("uses Zod Unicode code point length for password boundaries", () => {
  expect(adminPasswordSchema.safeParse("\u{1f600}".repeat(11)).success).toBe(false);
  expect(adminPasswordSchema.safeParse("\u{1f600}".repeat(12)).success).toBe(true);
  expect(adminPasswordSchema.safeParse("\u{1f600}".repeat(128)).success).toBe(true);
  expect(adminPasswordSchema.safeParse("\u{1f600}".repeat(129)).success).toBe(false);
});

test("validates the full input and rejects untrusted extra fields", () => {
  const input = { email: " ADMIN@Example.COM ", password: "a".repeat(12) };
  expect(firstAdminInputSchema.parse(input)).toEqual({ ...input, email: "admin@example.com" });
  expect(firstAdminInputSchema.safeParse({ ...input, passwordHash: "untrusted" }).success).toBe(false);
  expect(firstAdminInputSchema.safeParse({ ...input, isActive: false }).success).toBe(false);
});
