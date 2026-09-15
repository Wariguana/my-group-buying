import "server-only";

import { z } from "zod";

const environmentSchema = z.object({
  APP_BASE_URL: z.url(),
  ECPAY_LOGISTICS_ENVIRONMENT: z.enum(["stage", "production"]),
  ECPAY_LOGISTICS_MERCHANT_ID: z.string().regex(/^[A-Za-z0-9]{1,10}$/),
  ECPAY_LOGISTICS_HASH_KEY: z.string().regex(/^[A-Za-z0-9]{1,64}$/),
  ECPAY_LOGISTICS_HASH_IV: z.string().regex(/^[A-Za-z0-9]{1,64}$/),
});

export type EcpayLogisticsConfig = Readonly<{
  environment: "stage" | "production";
  merchantId: string;
  hashKey: string;
  hashIv: string;
  appBaseUrl: string;
  storeMapUrl: string;
  storeListUrl: string;
}>;

export function readEcpayLogisticsConfig(
  environment: Record<string, string | undefined> = process.env,
): EcpayLogisticsConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new Error("ECPay logistics environment is not configured correctly.");
  }

  const appBaseUrl = new URL(parsed.data.APP_BASE_URL);
  if (
    appBaseUrl.username !== ""
    || appBaseUrl.password !== ""
    || appBaseUrl.pathname !== "/"
    || appBaseUrl.search !== ""
    || appBaseUrl.hash !== ""
    || (appBaseUrl.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(appBaseUrl.hostname))
  ) {
    throw new Error("APP_BASE_URL must be an HTTPS origin or a loopback development origin.");
  }
  const stage = parsed.data.ECPAY_LOGISTICS_ENVIRONMENT === "stage";
  return Object.freeze({
    environment: parsed.data.ECPAY_LOGISTICS_ENVIRONMENT,
    merchantId: parsed.data.ECPAY_LOGISTICS_MERCHANT_ID,
    hashKey: parsed.data.ECPAY_LOGISTICS_HASH_KEY,
    hashIv: parsed.data.ECPAY_LOGISTICS_HASH_IV,
    appBaseUrl: appBaseUrl.toString().replace(/\/$/, ""),
    storeMapUrl: stage
      ? "https://logistics-stage.ecpay.com.tw/Express/map"
      : "https://logistics.ecpay.com.tw/Express/map",
    storeListUrl: stage
      ? "https://logistics-stage.ecpay.com.tw/Helper/GetStoreList"
      : "https://logistics.ecpay.com.tw/Helper/GetStoreList",
  });
}
