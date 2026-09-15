import "server-only";

import { z } from "zod";
import { createEcpayLogisticsCheckMacValue } from "@/lib/logistics/ecpay/checksum";
import { readEcpayLogisticsConfig, type EcpayLogisticsConfig } from "@/lib/logistics/ecpay/config";

export const ECPAY_SEVEN_ELEVEN_SUBTYPE = "UNIMARTC2C";

export type SevenElevenStore = Readonly<{
  id: string;
  name: string;
  address: string;
}>;

const storeListResponseSchema = z.strictObject({
  RtnCode: z.union([z.literal(1), z.literal("1")]),
  RtnMsg: z.string(),
  StoreList: z.array(z.strictObject({
    CvsType: z.string(),
    StoreInfo: z.array(z.strictObject({
      StoreId: z.string(),
      StoreName: z.string(),
      StoreAddr: z.string(),
      StorePhone: z.string(),
    })),
  })),
});

export function buildEcpayStoreMapRequest(
  merchantTradeNo: string,
  state: string,
  config: EcpayLogisticsConfig = readEcpayLogisticsConfig(),
): Readonly<{ action: string; fields: Readonly<Record<string, string>> }> {
  const serverReplyUrl = `${config.appBaseUrl}/api/logistics/ecpay/store-map/callback`;
  if (serverReplyUrl.length > 200) {
    throw new Error("ECPay ServerReplyURL exceeds the documented 200-character limit.");
  }
  return Object.freeze({
    action: config.storeMapUrl,
    fields: Object.freeze({
      MerchantID: config.merchantId,
      MerchantTradeNo: merchantTradeNo,
      LogisticsType: "CVS",
      LogisticsSubType: ECPAY_SEVEN_ELEVEN_SUBTYPE,
      IsCollection: "N",
      ServerReplyURL: serverReplyUrl,
      ExtraData: state,
      Device: "1",
    }),
  });
}

export async function resolveEcpaySevenElevenStore(
  storeId: string,
  config: EcpayLogisticsConfig = readEcpayLogisticsConfig(),
  fetcher: typeof fetch = fetch,
): Promise<SevenElevenStore | null> {
  const fixture = await import("@/lib/logistics/ecpay/e2e-fixture");
  if (fixture.isEcpayE2eFixtureEnabled()) {
    return storeId === fixture.E2E_SEVEN_ELEVEN_STORE.id ? fixture.E2E_SEVEN_ELEVEN_STORE : null;
  }
  const parameters = {
    PlatformID: "",
    MerchantID: config.merchantId,
    CvsType: "UNIMART",
  };
  const body = new URLSearchParams({
    ...parameters,
    CheckMacValue: createEcpayLogisticsCheckMacValue(parameters, config.hashKey, config.hashIv),
  });
  const response = await fetcher(config.storeListUrl, {
    method: "POST",
    headers: {
      Accept: "application/json, text/html",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const parsed = storeListResponseSchema.safeParse(await response.json());
  if (!parsed.success) return null;
  const entry = parsed.data.StoreList
    .find((list) => list.CvsType === "UNIMART")
    ?.StoreInfo.find((store) => store.StoreId === storeId);
  if (!entry) return null;
  return Object.freeze({ id: entry.StoreId, name: entry.StoreName, address: entry.StoreAddr });
}
