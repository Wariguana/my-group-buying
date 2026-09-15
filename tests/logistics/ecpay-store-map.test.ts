// @vitest-environment node

import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createEcpayLogisticsCheckMacValue } from "@/lib/logistics/ecpay/checksum";
import { buildEcpayStoreMapRequest, resolveEcpaySevenElevenStore } from "@/lib/logistics/ecpay/store-map";

const config = {
  environment: "stage" as const,
  merchantId: "2000933",
  hashKey: "XBERn1YOvpM9nfZc",
  hashIv: "h1ONHk4P4yqbl5LK",
  appBaseUrl: "https://example.test",
  storeMapUrl: "https://logistics-stage.ecpay.com.tw/Express/map",
  storeListUrl: "https://logistics-stage.ecpay.com.tw/Helper/GetStoreList",
};

describe("ECPay logistics boundary", () => {
  test("matches the official logistics MD5 CheckMacValue example", () => {
    expect(createEcpayLogisticsCheckMacValue({
      MerchantID: "2000933",
      MerchantTradeNo: "A20130312153023",
      MerchantTradeDate: "2013/03/12 15:30:23",
      LogisticsType: "CVS",
      LogisticsSubType: "FAMIC2C",
      GoodsAmount: "1000",
      IsCollection: "N",
      ServerReplyURL: "https://www.ecpay.com.tw/ServerReplyURL",
      SenderName: "寄件者姓名",
      ReceiverName: "收件者姓名",
      ReceiverStoreID: "001779",
    }, config.hashKey, config.hashIv)).toBe("692FD6E2CDB539CCDB7206C76DC239AD");
  });

  test("builds only the documented map request and uses UNIMARTC2C without COD", () => {
    expect(buildEcpayStoreMapRequest("abcdefghijklmnopqrst", "ABCDEFGHIJKLMNOPQRST", config)).toEqual({
      action: config.storeMapUrl,
      fields: {
        MerchantID: config.merchantId,
        MerchantTradeNo: "abcdefghijklmnopqrst",
        LogisticsType: "CVS",
        LogisticsSubType: "UNIMARTC2C",
        IsCollection: "N",
        ServerReplyURL: "https://example.test/api/logistics/ecpay/store-map/callback",
        ExtraData: "ABCDEFGHIJKLMNOPQRST",
        Device: "1",
      },
    });
  });

  test("rejects a ServerReplyURL above ECPay's documented 200-character limit", () => {
    expect(() => buildEcpayStoreMapRequest(
      "abcdefghijklmnopqrst",
      "ABCDEFGHIJKLMNOPQRST",
      { ...config, appBaseUrl: `https://example.test/${"a".repeat(180)}` },
    )).toThrow("ServerReplyURL exceeds the documented 200-character limit");
  });

  test("resolves canonical store data from the checksum-authenticated store list", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({
        RtnCode: 1,
        RtnMsg: "成功",
        StoreList: [{ CvsType: "UNIMART", StoreInfo: [{ StoreId: "123456", StoreName: "安心門市", StoreAddr: "臺北市安心路 1 號", StorePhone: "0212345678" }] }],
      }), { status: 200 });
    });
    await expect(resolveEcpaySevenElevenStore("123456", config, fetcher as unknown as typeof fetch)).resolves.toEqual({
      id: "123456", name: "安心門市", address: "臺北市安心路 1 號",
    });
    const request = fetcher.mock.calls[0];
    expect(request[0]).toBe(config.storeListUrl);
    expect(String((request[1] as RequestInit).body)).toContain("CheckMacValue=");
  });
});
