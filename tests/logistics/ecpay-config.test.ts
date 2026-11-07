// @vitest-environment node
import { expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readEcpayLogisticsConfig } from "@/lib/logistics/ecpay/config";

const env = {
  NODE_ENV: "production", QBUY_ENV: "production", QBUY_ENABLE_SEVEN_ELEVEN: "true",
  QBUY_ENABLE_LOGISTICS_EXTERNAL: "true", APP_BASE_URL: "https://shop.example",
  ECPAY_LOGISTICS_ENVIRONMENT: "production", ECPAY_LOGISTICS_MERCHANT_ID: "1234567",
  ECPAY_LOGISTICS_HASH_KEY: "fixtureKey", ECPAY_LOGISTICS_HASH_IV: "fixtureIv",
};

test("runtime config rejects production storefront using stage logistics even without preflight", () => {
  expect(() => readEcpayLogisticsConfig({ ...env, ECPAY_LOGISTICS_ENVIRONMENT: "stage" })).toThrow("PRODUCTION_LOGISTICS_REQUIRED");
  expect(() => readEcpayLogisticsConfig({ ...env, QBUY_ENABLE_LOGISTICS_EXTERNAL: "false" })).toThrow();
  expect(readEcpayLogisticsConfig(env).storeMapUrl).toBe("https://logistics.ecpay.com.tw/Express/map");
});

test("staging can still use stage logistics but cannot access production logistics", () => {
  expect(readEcpayLogisticsConfig({ ...env, QBUY_ENV: "staging", ECPAY_LOGISTICS_ENVIRONMENT: "stage" }).environment).toBe("stage");
  expect(() => readEcpayLogisticsConfig({ ...env, QBUY_ENV: "staging" })).toThrow("EXTERNAL_LOGISTICS_DISABLED");
});
