// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const boundary = vi.hoisted(() => ({ completeSelection: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logistics/store-selection", () => ({
  completeSevenElevenStoreSelection: boundary.completeSelection,
}));

import { POST } from "@/app/api/logistics/ecpay/store-map/callback/route";

const selectionToken = "T".repeat(43);

function callbackRequest({
  url = "https://shop.example/api/logistics/ecpay/store-map/callback",
  headers = {},
}: Readonly<{
  url?: string;
  headers?: Readonly<Record<string, string>>;
}> = {}) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      host: new URL(url).host,
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams({
      MerchantID: "2000933",
      MerchantTradeNo: "abcdefghijklmnopqrst",
      LogisticsSubType: "UNIMARTC2C",
      CVSStoreID: "123456",
      CVSStoreName: "門市名稱",
      CVSAddress: "臺北市門市地址",
      ExtraData: "ABCDEFGHIJKLMNOPQRST",
    }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  boundary.completeSelection.mockResolvedValue({
    slug: "gb-AbCdEf0123_-xyZ9",
    selectionToken,
  });
});

test("callback succeeds without a SameSite cookie and never creates or replaces browser binding", async () => {
  const response = await POST(callbackRequest());

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `https://shop.example/group-buys/gb-AbCdEf0123_-xyZ9?storeSelection=${selectionToken}`,
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

test("reverse-proxy HTTPS callback redirects to the public request-target origin, never localhost", async () => {
  const response = await POST(callbackRequest({
    url: "http://localhost:3000/api/logistics/ecpay/store-map/callback",
    headers: {
      host: "localhost:3000",
      "x-forwarded-host": "example.trycloudflare.com",
      "x-forwarded-proto": "https",
    },
  }));

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `https://example.trycloudflare.com/group-buys/gb-AbCdEf0123_-xyZ9?storeSelection=${selectionToken}`,
  );
  expect(response.headers.get("location")).not.toContain("localhost");
});

test("direct localhost callback still redirects to localhost", async () => {
  const response = await POST(callbackRequest({
    url: "http://localhost:3000/api/logistics/ecpay/store-map/callback",
  }));

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `http://localhost:3000/group-buys/gb-AbCdEf0123_-xyZ9?storeSelection=${selectionToken}`,
  );
});

test.each([
  ["forwarded host with a scheme", "https://example.trycloudflare.com", "https"],
  ["ambiguous forwarded host", "example.trycloudflare.com, evil.example", "https"],
  ["ambiguous forwarded protocol", "example.trycloudflare.com", "https,http"],
] as const)("callback fails closed for %s", async (_name, forwardedHost, forwardedProtocol) => {
  const response = await POST(callbackRequest({
    url: "http://localhost:3000/api/logistics/ecpay/store-map/callback",
    headers: {
      host: "localhost:3000",
      "x-forwarded-host": forwardedHost,
      "x-forwarded-proto": forwardedProtocol,
    },
  }));

  expect(response.status).toBe(400);
  expect(response.headers.get("location")).toBeNull();
  const body = await response.text();
  expect(body).toBe("Invalid callback.");
  expect(body).not.toContain(selectionToken);
  expect(body).not.toContain("localhost");
  expect(boundary.completeSelection).not.toHaveBeenCalled();
});

test("invalid or expired callback keeps its existing non-redirect response", async () => {
  boundary.completeSelection.mockResolvedValue(null);
  const response = await POST(callbackRequest());

  expect(response.status).toBe(400);
  expect(response.headers.get("location")).toBeNull();
  expect(await response.text()).toBe("Invalid or expired callback.");
});

test("store verification failure keeps its existing non-redirect response", async () => {
  boundary.completeSelection.mockRejectedValue(new Error("private verification detail"));
  const response = await POST(callbackRequest());

  expect(response.status).toBe(502);
  expect(response.headers.get("location")).toBeNull();
  expect(await response.text()).toBe("Store verification failed.");
});
