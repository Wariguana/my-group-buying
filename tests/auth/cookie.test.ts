// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ADMIN_SESSION_COOKIE_NAME, adminSessionCookieOptions } from "@/lib/auth/cookie";
afterEach(() => vi.unstubAllEnvs());

test.each(["development", "production"])("cookie options in %s match session expiry", (environment) => {
  vi.stubEnv("NODE_ENV", environment);
  const expiresAt = new Date("2026-09-15T10:00:00.123Z");
  expect(ADMIN_SESSION_COOKIE_NAME).toBe("admin_session");
  expect(adminSessionCookieOptions(expiresAt)).toEqual({
    httpOnly: true, sameSite: "lax", path: "/", secure: environment === "production", expires: expiresAt,
  });
});
