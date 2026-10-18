// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ workerHeartbeat: { findUnique: vi.fn() }, $transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
import { createCheckout } from "@/lib/checkout/service";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
test("production cannot create checkout when default gate is closed", async () => {
  vi.stubEnv("QBUY_ENV", "production"); vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_BASE_URL", "https://shop.example.com"); vi.stubEnv("DATABASE_URL", "postgresql://app@private/qbuy_production");
  await expect(createCheckout({}, "invalid")).rejects.toThrow("暫停新結帳"); expect(db.$transaction).not.toHaveBeenCalled();
});
test("approved production checkout still fails before reservation if worker is stale", async () => {
  vi.stubEnv("QBUY_ENV", "production"); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_BASE_URL", "https://shop.example.com");
  vi.stubEnv("DATABASE_URL", "postgresql://app@private/qbuy_production"); vi.stubEnv("LINE_LOGIN_REDIRECT_URI", "https://shop.example.com/api/auth/line/callback");
  for (const name of ["CHECKOUT", "LOGIN", "BANK_DETAILS", "HOME_DELIVERY"]) vi.stubEnv(`QBUY_ENABLE_${name}`, "true");
  vi.stubEnv("QBUY_COMMERCE_APPROVAL", "approved"); db.workerHeartbeat.findUnique.mockResolvedValue({ lastSuccessAt: new Date(0), lastError: null });
  await expect(createCheckout({}, "invalid")).rejects.toThrow("結帳暫停"); expect(db.$transaction).not.toHaveBeenCalled();
});
