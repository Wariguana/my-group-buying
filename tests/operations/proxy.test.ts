// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { proxy, config } from "@/proxy";

afterEach(() => vi.unstubAllEnvs());

test("retiring the old order POST gate does not open a closed storefront", () => {
  vi.stubEnv("QBUY_ENV", "production");
  vi.stubEnv("QBUY_ENABLE_STOREFRONT", "false");
  const response = proxy();
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Retry-After")).toBe("300");
  expect(config.matcher).toContain("/group-buys/:path*");
  expect(config.matcher).toContain("/checkout");
});

test("an enabled storefront passes through to the current route handlers", () => {
  vi.stubEnv("QBUY_ENV", "production");
  vi.stubEnv("QBUY_ENABLE_STOREFRONT", "true");
  expect(proxy().headers.get("x-middleware-next")).toBe("1");
});
