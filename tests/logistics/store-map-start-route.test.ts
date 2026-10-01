// @vitest-environment node

import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const boundary = vi.hoisted(() => ({
  beginSelection: vi.fn(),
  getPendingRequest: vi.fn(),
  buildMapRequest: vi.fn(),
  createBinding: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logistics/store-selection", () => ({
  beginSevenElevenStoreSelection: boundary.beginSelection,
  getPendingSevenElevenMapRequest: boundary.getPendingRequest,
}));
vi.mock("@/lib/logistics/ecpay/store-map", () => ({
  buildEcpayStoreMapRequest: boundary.buildMapRequest,
}));
vi.mock("@/lib/logistics/store-selection-cookie", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/logistics/store-selection-cookie")>(),
  createStoreSelectionBinding: boundary.createBinding,
}));

import * as startRoute from "@/app/api/logistics/ecpay/store-map/start/route";
import {
  STORE_SELECTION_BINDING_COOKIE,
  STORE_SELECTION_BINDING_MAX_AGE_SECONDS,
} from "@/lib/logistics/store-selection-cookie";

const slug = "gb-AbCdEf0123_-xyZ9";
const state = "ABCDEFGHIJKLMNOPQRST";
const merchantTradeNo = "abcdefghijklmnopqrst";
const createdBinding = "A".repeat(43);
const existingBinding = "B".repeat(43);
const mapAction = "https://logistics-stage.ecpay.com.tw/Express/map";
const mapFields = {
  MerchantID: "2000933",
  MerchantTradeNo: merchantTradeNo,
  LogisticsType: "CVS",
  LogisticsSubType: "UNIMARTC2C",
  IsCollection: "N",
  ServerReplyURL: "https://shop.example/api/logistics/ecpay/store-map/callback",
  ExtraData: state,
};

function startRequest({
  url = "https://shop.example/api/logistics/ecpay/store-map/start",
  origin = "https://shop.example",
  headers = {},
  entries = [["groupBuySlug", slug]],
}: Readonly<{
  url?: string;
  origin?: string | null;
  headers?: Readonly<Record<string, string>>;
  entries?: readonly (readonly [string, string])[];
}> = {}) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      host: new URL(url).host,
      ...(origin === null ? {} : { origin }),
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(entries.map(([name, value]) => [name, value])),
  });
}

function expectNoSelectionMutation() {
  expect(boundary.createBinding).not.toHaveBeenCalled();
  expect(boundary.beginSelection).not.toHaveBeenCalled();
  expect(boundary.getPendingRequest).not.toHaveBeenCalled();
  expect(boundary.buildMapRequest).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("E2E_ECPAY_FIXTURE", "0");
  boundary.createBinding.mockReturnValue(createdBinding);
  boundary.beginSelection.mockResolvedValue({ state });
  boundary.getPendingRequest.mockResolvedValue({ state, merchantTradeNo });
  boundary.buildMapRequest.mockReturnValue({ action: mapAction, fields: mapFields });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("same-origin native POST creates one authoritative selection and returns same-tab ECPay HTML", async () => {
  const response = await startRoute.POST(startRequest());
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(boundary.beginSelection).toHaveBeenCalledExactlyOnceWith(slug, createdBinding);
  expect(boundary.getPendingRequest).toHaveBeenCalledExactlyOnceWith(state);
  expect(boundary.buildMapRequest).toHaveBeenCalledExactlyOnceWith(merchantTradeNo, state);
  expect(html).toContain(`<form id="ecpay-map" method="post" action="${mapAction}">`);
  for (const [name, value] of Object.entries(mapFields)) {
    expect(html).toContain(`name="${name}" value="${value}"`);
  }
  expect(html).not.toContain(createdBinding);
  expect(html).not.toMatch(/target=|window\.open|<iframe/);
  expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  expect(script).toBe('document.getElementById("ecpay-map").submit()');
  const scriptHash = createHash("sha256").update(script!).digest("base64");
  expect(response.headers.get("Content-Security-Policy")).toBe(
    `default-src 'none'; script-src 'sha256-${scriptHash}'; form-action https://logistics-stage.ecpay.com.tw`,
  );
  expect(startRoute).not.toHaveProperty("GET");
});

test("reverse-proxy public HTTPS origin succeeds despite an internal HTTP request URL", async () => {
  const response = await startRoute.POST(startRequest({
    url: "http://localhost:3000/api/logistics/ecpay/store-map/start",
    origin: "https://example.trycloudflare.com",
    headers: {
      host: "localhost:3000",
      "x-forwarded-host": "example.trycloudflare.com",
      "x-forwarded-proto": "https",
    },
  }));

  expect(response.status).toBe(200);
  expect(boundary.beginSelection).toHaveBeenCalledTimes(1);
  expect(response.headers.get("Content-Security-Policy")).toContain("form-action https://logistics-stage.ecpay.com.tw");
});

test.each([
  ["cross-origin", "https://attacker.example"],
  ["missing Origin", null],
  ["opaque Origin", "null"],
  ["malformed Origin", "not-an-origin"],
  ["Origin with a path", "https://shop.example/path"],
  ["Origin with credentials", "https://attacker@shop.example"],
  ["multiple origins", "https://shop.example, https://attacker.example"],
] as const)("%s fails closed before body parsing or selection mutation", async (_name, origin) => {
  const request = startRequest({ origin });
  const parseForm = vi.spyOn(request, "formData");
  const response = await startRoute.POST(request);

  expect(response.status).toBe(403);
  expect(await response.text()).toBe("Invalid store selection request.");
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(parseForm).not.toHaveBeenCalled();
  expectNoSelectionMutation();
});

test.each([
  ["forwarded host with a scheme", "https://shop.example", "https"],
  ["ambiguous forwarded host", "shop.example, attacker.example", "https"],
  ["ambiguous forwarded protocol", "shop.example", "https,http"],
] as const)("%s is rejected by the shared origin helper before mutation", async (_name, host, protocol) => {
  const response = await startRoute.POST(startRequest({
    headers: { "x-forwarded-host": host, "x-forwarded-proto": protocol },
  }));

  expect(response.status).toBe(403);
  expect(response.headers.get("set-cookie")).toBeNull();
  expectNoSelectionMutation();
});

test.each([
  "bad",
  `${slug}/../attacker`,
  `https://attacker.example/${slug}`,
  "",
])("invalid slug %s returns safe 400 before mutation", async (invalidSlug) => {
  const response = await startRoute.POST(startRequest({ entries: [["groupBuySlug", invalidSlug]] }));

  expect(response.status).toBe(400);
  expect(await response.text()).toBe("Invalid store selection request.");
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("set-cookie")).toBeNull();
  expectNoSelectionMutation();
});

test.each([
  ["missing slug", []],
  ["duplicate slug", [["groupBuySlug", slug], ["groupBuySlug", slug]]],
  ["browser binding", [["groupBuySlug", slug], ["browserBinding", existingBinding]]],
  ["selection token", [["groupBuySlug", slug], ["storeSelectionToken", state]]],
  ["customer name", [["groupBuySlug", slug], ["customerName", "顧客"]]],
  ["customer phone", [["groupBuySlug", slug], ["customerPhone", "0912345678"]]],
  ["quantity", [["groupBuySlug", slug], ["item:untrusted", "1"]]],
  ["price", [["groupBuySlug", slug], ["price:untrusted", "1"]]],
  ["pickup ID", [["groupBuySlug", slug], ["groupBuyPickupId", "untrusted"]]],
  ["unknown field", [["groupBuySlug", slug], ["extra", "untrusted"]]],
] as const)("%s violates the exactly-one-public-slug body and returns 400", async (_name, entries) => {
  const response = await startRoute.POST(startRequest({ entries }));

  expect(response.status).toBe(400);
  expect(response.headers.get("set-cookie")).toBeNull();
  expectNoSelectionMutation();
});

test("a File submitted instead of a string slug is rejected before mutation", async () => {
  const body = new FormData();
  body.append("groupBuySlug", new Blob([slug]), "slug.txt");
  const request = new NextRequest("https://shop.example/api/logistics/ecpay/store-map/start", {
    method: "POST",
    headers: { host: "shop.example", origin: "https://shop.example" },
    body,
  });
  const response = await startRoute.POST(request);

  expect(response.status).toBe(400);
  expectNoSelectionMutation();
});

test("malformed FormData returns a safe 400 before binding creation", async () => {
  const request = new NextRequest("https://shop.example/api/logistics/ecpay/store-map/start", {
    method: "POST",
    headers: {
      host: "shop.example",
      origin: "https://shop.example",
      "Content-Type": "multipart/form-data; boundary=missing",
    },
    body: "invalid multipart body",
  });
  const response = await startRoute.POST(request);

  expect(response.status).toBe(400);
  expect(await response.text()).toBe("Invalid store selection request.");
  expect(response.headers.get("set-cookie")).toBeNull();
  expectNoSelectionMutation();
});

test("existing valid HttpOnly binding is reused and refreshed with the established cookie options", async () => {
  const response = await startRoute.POST(startRequest({
    headers: { cookie: `${STORE_SELECTION_BINDING_COOKIE}=${existingBinding}` },
  }));

  expect(boundary.createBinding).not.toHaveBeenCalled();
  expect(boundary.beginSelection).toHaveBeenCalledExactlyOnceWith(slug, existingBinding);
  expect((response as NextResponse).cookies.get(STORE_SELECTION_BINDING_COOKIE)).toMatchObject({
    value: existingBinding,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: STORE_SELECTION_BINDING_MAX_AGE_SECONDS,
  });
  const cookie = response.headers.get("set-cookie");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=lax");
  expect(cookie).toContain("Path=/");
  expect(cookie).toContain(`Max-Age=${STORE_SELECTION_BINDING_MAX_AGE_SECONDS}`);
});

test.each([null, "invalid-browser-binding"])("missing or invalid binding %s is created only by the server", async (binding) => {
  const response = await startRoute.POST(startRequest({
    headers: binding === null ? {} : { cookie: `${STORE_SELECTION_BINDING_COOKIE}=${binding}` },
  }));

  expect(boundary.createBinding).toHaveBeenCalledExactlyOnceWith();
  expect(boundary.beginSelection).toHaveBeenCalledExactlyOnceWith(slug, createdBinding);
  expect((response as NextResponse).cookies.get(STORE_SELECTION_BINDING_COOKIE)?.value).toBe(createdBinding);
});

test("production binding retains Secure and HttpOnly cookie protections", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const response = await startRoute.POST(startRequest());

  expect(response.headers.get("set-cookie")).toContain("Secure");
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
});

test.each(["begin", "pending", "provider config", "binding creation"] as const)(
  "%s exceptions safely redirect the valid slug without exposing internal details",
  async (stage) => {
    const internalDetail = "private-internal-error-detail";
    if (stage === "begin") boundary.beginSelection.mockRejectedValue(new Error(internalDetail));
    if (stage === "pending") boundary.getPendingRequest.mockRejectedValue(new Error(internalDetail));
    if (stage === "provider config") boundary.buildMapRequest.mockImplementation(() => { throw new Error(internalDetail); });
    if (stage === "binding creation") boundary.createBinding.mockImplementation(() => { throw new Error(internalDetail); });
    const response = await startRoute.POST(startRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`https://shop.example/group-buys/${slug}?storeSelectionError=unavailable`);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).not.toContain(internalDetail);
    expect(response.headers.get("location")).not.toContain(internalDetail);
  },
);

test("missing authoritative pending request safely redirects without rendering a map or issuing a cookie", async () => {
  boundary.getPendingRequest.mockResolvedValue(null);
  const response = await startRoute.POST(startRequest());

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(`https://shop.example/group-buys/${slug}?storeSelectionError=unavailable`);
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(boundary.buildMapRequest).not.toHaveBeenCalled();
});

test("unavailable selection behind a reverse proxy redirects only to the verified public HTTPS origin", async () => {
  boundary.beginSelection.mockRejectedValue(new Error("STORE_SELECTION_UNAVAILABLE"));
  const response = await startRoute.POST(startRequest({
    url: "http://localhost:3000/api/logistics/ecpay/store-map/start",
    origin: "https://example.trycloudflare.com",
    headers: {
      host: "localhost:3000",
      "x-forwarded-host": "example.trycloudflare.com",
      "x-forwarded-proto": "https",
    },
  }));

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(`https://example.trycloudflare.com/group-buys/${slug}?storeSelectionError=unavailable`);
});

test.each([
  ["ordinary development database", "1", "postgresql://fixture:fixture@localhost/my_group_buying_dev", false],
  ["production-like database name", "1", "postgresql://fixture:fixture@localhost/my_group_buying_production", false],
  ["malformed database URL", "1", "invalid-url", false],
  ["invalid disposable suffix", "1", `postgresql://fixture:fixture@localhost/my_group_buying_e2e_${"a".repeat(31)}`, false],
  ["disposable database without flag", "0", `postgresql://fixture:fixture@localhost/my_group_buying_e2e_${"a".repeat(32)}`, false],
  ["flag plus disposable database", "1", `postgresql://fixture:fixture@localhost/my_group_buying_e2e_${"a".repeat(32)}`, true],
] as const)("fixture guard retains its requirement for %s", async (_name, flag, databaseUrl, enabled) => {
  vi.stubEnv("E2E_ECPAY_FIXTURE", flag);
  vi.stubEnv("DATABASE_URL", databaseUrl);
  const response = await startRoute.POST(startRequest({
    url: "http://localhost:3000/api/logistics/ecpay/store-map/start",
    origin: "https://example.trycloudflare.com",
    headers: {
      host: "localhost:3000",
      "x-forwarded-host": "example.trycloudflare.com",
      "x-forwarded-proto": "https",
    },
  }));
  const html = await response.text();

  expect(html).toContain(`action="${enabled ? "/api/logistics/ecpay/store-map/test-fixture" : mapAction}"`);
  expect(response.headers.get("Content-Security-Policy")).toMatch(new RegExp(
    `form-action ${enabled ? "https://example\\.trycloudflare\\.com" : "https://logistics-stage\\.ecpay\\.com\\.tw"}$`,
  ));
});

test("server map fields remain HTML escaped", async () => {
  boundary.buildMapRequest.mockReturnValue({
    action: mapAction,
    fields: { ExtraData: '<script>alert("unsafe")</script>&\'quoted\'' },
  });
  const response = await startRoute.POST(startRequest());
  const html = await response.text();

  expect(html).toContain("&lt;script&gt;alert(&quot;unsafe&quot;)&lt;/script&gt;&amp;&#39;quoted&#39;");
  expect(html).not.toContain('<script>alert("unsafe")</script>');
});
