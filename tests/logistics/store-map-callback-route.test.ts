// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({ completeSelection: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logistics/store-selection", () => ({
  completeSevenElevenStoreSelection: boundary.completeSelection,
}));

import { POST } from "@/app/api/logistics/ecpay/store-map/callback/route";

beforeEach(() => {
  vi.resetAllMocks();
  boundary.completeSelection.mockResolvedValue({
    slug: "gb-AbCdEf0123_-xyZ9",
    selectionToken: "T".repeat(43),
  });
});

test("callback succeeds without a SameSite cookie and never creates or replaces browser binding", async () => {
  const response = await POST(new Request(
    "https://shop.example/api/logistics/ecpay/store-map/callback",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        MerchantID: "2000933",
        MerchantTradeNo: "abcdefghijklmnopqrst",
        LogisticsSubType: "UNIMARTC2C",
        CVSStoreID: "123456",
        CVSStoreName: "門市名稱",
        CVSAddress: "臺北市門市地址",
        ExtraData: "ABCDEFGHIJKLMNOPQRST",
      }),
    },
  ));

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `https://shop.example/group-buys/gb-AbCdEf0123_-xyZ9?storeSelection=${"T".repeat(43)}`,
  );
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(boundary.completeSelection).toHaveBeenCalledExactlyOnceWith({
    MerchantID: "2000933",
    MerchantTradeNo: "abcdefghijklmnopqrst",
    LogisticsSubType: "UNIMARTC2C",
    CVSStoreID: "123456",
    CVSStoreName: "門市名稱",
    CVSAddress: "臺北市門市地址",
    ExtraData: "ABCDEFGHIJKLMNOPQRST",
  });
});
