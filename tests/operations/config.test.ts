// @vitest-environment node
import { describe, expect, test } from "vitest";
import { assertDeployment, featureEnabled } from "@/lib/operations/config";
const valid = { NODE_ENV: "production", QBUY_ENV: "production", APP_BASE_URL: "https://shop.example.com", DATABASE_URL: "postgresql://app:secret@private.example/qbuy_production" };
describe("deployment gates", () => {
  test("all deployed features default closed", () => { for (const f of ["STOREFRONT", "LOGIN", "CHECKOUT", "BANK_DETAILS", "SEVEN_ELEVEN", "FAMILY_MART", "HOME_DELIVERY", "LINE_PUSH", "LOGISTICS_EXTERNAL"] as const) expect(featureEnabled(f, valid)).toBe(false); expect(() => assertDeployment(valid)).not.toThrow(); });
  test.each(["E2E_ECPAY_FIXTURE", "E2E_ADMIN_PASSWORD", "NEXT_DEV_ALLOWED_ORIGIN"])("rejects %s", key => { expect(() => assertDeployment({ ...valid, [key]: "1" })).toThrow("TEST_CONFIGURATION"); });
  test.each(["https://x.trycloudflare.com", "http://shop.example.com", "https://user:pass@shop.example.com", "https://shop.example.com/path"])("rejects unsafe origin %s", APP_BASE_URL => { expect(() => assertDeployment({ ...valid, APP_BASE_URL })).toThrow(); });
  test("rejects deployment pointed at development", () => { expect(() => assertDeployment({ ...valid, DATABASE_URL: "postgresql://app@localhost/my_group_buying_dev" })).toThrow("ISOLATED_DATABASE"); });
  test("unknown runtime cannot turn on checkout", () => { expect(featureEnabled("CHECKOUT", { NODE_ENV: "production", QBUY_ENABLE_CHECKOUT: "true" })).toBe(false); });
  test("test escape requires isolated loopback DB", () => { expect(featureEnabled("CHECKOUT", { NODE_ENV: "production", QBUY_ENV: "test", DATABASE_URL: "postgresql://app@external/my_group_buying_e2e_" + "a".repeat(32) })).toBe(false); });
  test("checkout requires approvals, login, bank and shipping", () => { expect(() => assertDeployment({ ...valid, QBUY_ENABLE_CHECKOUT: "true" })).toThrow("COMMERCE_APPROVAL"); expect(() => assertDeployment({ ...valid, QBUY_ENABLE_CHECKOUT: "true", QBUY_ENABLE_LOGIN: "true", LINE_LOGIN_REDIRECT_URI: "https://shop.example.com/api/auth/line/callback", QBUY_ENABLE_BANK_DETAILS: "true", QBUY_ENABLE_HOME_DELIVERY: "true", QBUY_COMMERCE_APPROVAL: "approved" })).not.toThrow(); });
  test.each([{ LINE_MESSAGING_ENABLED: "true" }, { QBUY_ENABLE_LINE_PUSH: "true" }, { ECPAY_LOGISTICS_ENVIRONMENT: "production" }])("staging rejects real effects %j", extra => { expect(() => assertDeployment({ ...valid, QBUY_ENV: "staging", ...extra })).toThrow("STAGING_EXTERNAL_EFFECT"); expect(featureEnabled("LINE_PUSH", { ...valid, QBUY_ENV: "staging", QBUY_ENABLE_LINE_PUSH: "true" })).toBe(false); });
  test("false and malformed flags stay closed", () => { expect(featureEnabled("CHECKOUT", { NODE_ENV: "test", QBUY_ENABLE_CHECKOUT: "false" })).toBe(false); expect(featureEnabled("CHECKOUT", { ...valid, QBUY_ENABLE_CHECKOUT: "TRUE" })).toBe(false); });
});
