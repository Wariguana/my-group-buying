// @vitest-environment node
import { randomBytes } from "node:crypto";
import { expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { adminLoginInputSchema } from "@/lib/auth/validation";

test("normalizes and validates email without changing password spaces, case or Unicode", () => {
  const password = ` A${randomBytes(8).toString("hex")}e\u0301 `;
  const result = adminLoginInputSchema.parse({ email: " ADMIN@Example.COM ", password });
  expect(result.email).toBe("admin@example.com");
  expect(result.password === password).toBe(true);
});

test.each([1, 128])("accepts a login password of %i characters", (length) => {
  const password = randomBytes(128).toString("hex").slice(0, length);
  expect(adminLoginInputSchema.safeParse({ email: "a@example.com", password }).success).toBe(true);
});

test.each([
  { email: "invalid", password: "x" },
  { email: "a@example.com", password: "" },
  { email: "a@example.com", password: randomBytes(129).toString("hex").slice(0, 129) },
  { email: "a@example.com", password: 123 },
  { email: "a@example.com", password: "x", isActive: true },
  { email: "a@example.com", password: "x", passwordHash: "extra" },
  null,
])("rejects invalid login input case %#", (input) => {
  expect(adminLoginInputSchema.safeParse(input).success).toBe(false);
});
