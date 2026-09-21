// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({ fetchIdentity: vi.fn(), createSession: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/customer-auth/line", async () => {
  const actual = await vi.importActual<typeof import("@/lib/customer-auth/line")>("@/lib/customer-auth/line");
  return { ...actual, fetchVerifiedLineIdentity: boundary.fetchIdentity };
});
vi.mock("@/lib/customer-auth/session", () => ({ createCustomerSession: boundary.createSession }));

import { GET } from "@/app/api/auth/line/callback/route";
import {
  CUSTOMER_SESSION_COOKIE_NAME,
  LINE_OAUTH_NONCE_COOKIE_NAME,
  LINE_OAUTH_STATE_COOKIE_NAME,
  LINE_OAUTH_VERIFIER_COOKIE_NAME,
} from "@/lib/customer-auth/cookie";

const secret = "a".repeat(43);
const otherSecret = "b".repeat(43);
const identity = { lineUserId: "verified-sub", displayName: "Name", pictureUrl: null };
const expiresAt = new Date("2026-10-22T00:00:00.000Z");

function callbackRequest(
  query: string,
  cookies: Record<string, string> = {},
  options: Readonly<{ url?: string; headers?: HeadersInit }> = {},
) {
  const url = options.url ?? "https://app.example.com/api/auth/line/callback";
  const cookieHeader = Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join("; ");
  const headers = new Headers(options.headers);
  if (!headers.has("host")) headers.set("host", new URL(url).host);
  if (cookieHeader) headers.set("cookie", cookieHeader);
  return new NextRequest(`${url}?${query}`, {
    headers,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  boundary.fetchIdentity.mockResolvedValue(identity);
  boundary.createSession.mockResolvedValue({ token: "s".repeat(43), expiresAt, account: identity });
});

test.each([
  ["mismatched state", `code=code&state=${otherSecret}`, {
    [LINE_OAUTH_STATE_COOKIE_NAME]: secret,
    [LINE_OAUTH_NONCE_COOKIE_NAME]: secret,
    [LINE_OAUTH_VERIFIER_COOKIE_NAME]: secret,
  }],
  ["missing transient cookies", `code=code&state=${secret}`, {}],
  ["duplicate state", `code=code&state=${secret}&state=${secret}`, {
    [LINE_OAUTH_STATE_COOKIE_NAME]: secret,
    [LINE_OAUTH_NONCE_COOKIE_NAME]: secret,
    [LINE_OAUTH_VERIFIER_COOKIE_NAME]: secret,
  }],
] as const)("%s fails closed before LINE or DB calls", async (_name, query, cookieValues) => {
  const response = await GET(callbackRequest(query, cookieValues));
  expect(response.status).toBe(303);
  expect(new URL(response.headers.get("location")!).searchParams.get("line_login")).toBe("invalid_state");
  expect(boundary.fetchIdentity).not.toHaveBeenCalled();
  expect(boundary.createSession).not.toHaveBeenCalled();
  const setCookie = response.headers.getSetCookie().join("\n");
  expect(setCookie).toContain(`${LINE_OAUTH_STATE_COOKIE_NAME}=`);
  expect(setCookie).toContain(`${LINE_OAUTH_NONCE_COOKIE_NAME}=`);
  expect(setCookie).toContain(`${LINE_OAUTH_VERIFIER_COOKIE_NAME}=`);
  expect(setCookie.match(/Max-Age=0/g)).toHaveLength(3);
});

test("verified identity alone reaches account/session creation and sets a fresh session", async () => {
  const response = await GET(callbackRequest(`code=code&state=${secret}`, {
    [LINE_OAUTH_STATE_COOKIE_NAME]: secret,
    [LINE_OAUTH_NONCE_COOKIE_NAME]: secret,
    [LINE_OAUTH_VERIFIER_COOKIE_NAME]: secret,
  }));
  expect(boundary.fetchIdentity).toHaveBeenCalledExactlyOnceWith({
    code: "code",
    nonce: secret,
    codeVerifier: secret,
  });
  expect(boundary.createSession).toHaveBeenCalledExactlyOnceWith(identity);
  expect(new URL(response.headers.get("location")!).pathname).toBe("/");
  expect(response.headers.getSetCookie().join("\n")).toContain(`${CUSTOMER_SESSION_COOKIE_NAME}=${"s".repeat(43)}`);
});

test("verification failure creates no account/session and exposes only a safe category", async () => {
  const { LineLoginError } = await import("@/lib/customer-auth/line");
  boundary.fetchIdentity.mockRejectedValue(new LineLoginError("ID_TOKEN_VERIFICATION_FAILED"));
  const response = await GET(callbackRequest(`code=code&state=${secret}`, {
    [LINE_OAUTH_STATE_COOKIE_NAME]: secret,
    [LINE_OAUTH_NONCE_COOKIE_NAME]: secret,
    [LINE_OAUTH_VERIFIER_COOKIE_NAME]: secret,
  }));
  expect(boundary.createSession).not.toHaveBeenCalled();
  expect(new URL(response.headers.get("location")!).searchParams.get("line_login"))
    .toBe("id_token_verification_failed");
});

test.each([
  ["correct state", `error=access_denied&state=${secret}`, "denied"],
  ["wrong state", `error=access_denied&state=${otherSecret}`, "invalid_state"],
  ["missing state", "error=access_denied", "invalid_state"],
  ["duplicate state", `error=access_denied&state=${secret}&state=${secret}`, "invalid_state"],
] as const)("LINE denial with %s returns %s and clears transient cookies", async (_name, query, expected) => {
  const response = await GET(callbackRequest(query, {
    [LINE_OAUTH_STATE_COOKIE_NAME]: secret,
    [LINE_OAUTH_NONCE_COOKIE_NAME]: secret,
    [LINE_OAUTH_VERIFIER_COOKIE_NAME]: secret,
  }));
  expect(new URL(response.headers.get("location")!).searchParams.get("line_login")).toBe(expected);
  expect(boundary.fetchIdentity).not.toHaveBeenCalled();
  expect(boundary.createSession).not.toHaveBeenCalled();
  expect(response.headers.getSetCookie().join("\n").match(/Max-Age=0/g)).toHaveLength(3);
});

test("callback success behind a reverse proxy redirects to the public HTTPS origin", async () => {
  const response = await GET(callbackRequest(`code=code&state=${secret}`, {
    [LINE_OAUTH_STATE_COOKIE_NAME]: secret,
    [LINE_OAUTH_NONCE_COOKIE_NAME]: secret,
    [LINE_OAUTH_VERIFIER_COOKIE_NAME]: secret,
  }, {
    url: "http://localhost:3000/api/auth/line/callback",
    headers: {
      host: "localhost:3000",
      "x-forwarded-host": "example.trycloudflare.com",
      "x-forwarded-proto": "https",
    },
  }));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("https://example.trycloudflare.com/");
  expect(response.headers.get("location")).not.toContain("localhost");
  expect(boundary.createSession).toHaveBeenCalledExactlyOnceWith(identity);
});

test("invalid state behind a reverse proxy redirects its safe error to the public HTTPS origin", async () => {
  const response = await GET(callbackRequest(`code=code&state=${otherSecret}`, {
    [LINE_OAUTH_STATE_COOKIE_NAME]: secret,
    [LINE_OAUTH_NONCE_COOKIE_NAME]: secret,
    [LINE_OAUTH_VERIFIER_COOKIE_NAME]: secret,
  }, {
    url: "http://localhost:3000/api/auth/line/callback",
    headers: {
      host: "localhost:3000",
      "x-forwarded-host": "example.trycloudflare.com",
      "x-forwarded-proto": "https",
    },
  }));
  expect(response.status).toBe(303);
  expect(response.headers.get("location"))
    .toBe("https://example.trycloudflare.com/?line_login=invalid_state");
  expect(response.headers.get("location")).not.toContain("localhost");
  expect(boundary.fetchIdentity).not.toHaveBeenCalled();
  expect(boundary.createSession).not.toHaveBeenCalled();
  expect(response.headers.getSetCookie().join("\n").match(/Max-Age=0/g)).toHaveLength(3);
});

test.each([
  ["forwarded host with a scheme", "https://example.trycloudflare.com", "https"],
  ["ambiguous forwarded host", "example.trycloudflare.com, evil.example", "https"],
  ["ambiguous forwarded protocol", "example.trycloudflare.com", "https,http"],
] as const)("callback fails closed for %s", async (_name, forwardedHost, forwardedProtocol) => {
  const response = await GET(callbackRequest(`code=code&state=${secret}`, {
    [LINE_OAUTH_STATE_COOKIE_NAME]: secret,
    [LINE_OAUTH_NONCE_COOKIE_NAME]: secret,
    [LINE_OAUTH_VERIFIER_COOKIE_NAME]: secret,
  }, {
    url: "http://localhost:3000/api/auth/line/callback",
    headers: {
      host: "localhost:3000",
      "x-forwarded-host": forwardedHost,
      "x-forwarded-proto": forwardedProtocol,
    },
  }));
  expect(response.status).toBe(400);
  expect(response.headers.get("location")).toBeNull();
  expect(await response.json()).toEqual({ error: "無法驗證 LINE 登入回呼來源。" });
  expect(boundary.fetchIdentity).not.toHaveBeenCalled();
  expect(boundary.createSession).not.toHaveBeenCalled();
  expect(response.headers.getSetCookie().join("\n").match(/Max-Age=0/g)).toHaveLength(3);
});
