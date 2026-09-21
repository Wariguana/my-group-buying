// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({ revoke: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/customer-auth/session", () => ({ revokeCustomerSession: boundary.revoke }));

import { GET as startLogin } from "@/app/api/auth/line/start/route";
import { POST as logout } from "@/app/api/auth/line/logout/route";
import {
  CUSTOMER_SESSION_COOKIE_NAME,
  LINE_OAUTH_NONCE_COOKIE_NAME,
  LINE_OAUTH_STATE_COOKIE_NAME,
  LINE_OAUTH_VERIFIER_COOKIE_NAME,
} from "@/lib/customer-auth/cookie";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "channel-id");
  vi.stubEnv("LINE_LOGIN_CHANNEL_SECRET", "channel-secret");
  vi.stubEnv("LINE_LOGIN_REDIRECT_URI", "https://app.example.com/api/auth/line/callback");
});

afterEach(() => vi.unstubAllEnvs());

test("start route redirects to LINE with three short-lived HttpOnly transient cookies", async () => {
  const response = await startLogin();
  expect(response.status).toBe(307);
  expect(new URL(response.headers.get("location")!).origin).toBe("https://access.line.me");
  const cookies = response.headers.getSetCookie().join("\n");
  for (const name of [LINE_OAUTH_STATE_COOKIE_NAME, LINE_OAUTH_NONCE_COOKIE_NAME, LINE_OAUTH_VERIFIER_COOKIE_NAME]) {
    expect(cookies).toContain(`${name}=`);
  }
  expect(cookies.match(/HttpOnly/g)).toHaveLength(3);
  expect(cookies.match(/SameSite=lax/g)).toHaveLength(3);
  expect(cookies.match(/Max-Age=600/g)).toHaveLength(3);
  expect(cookies.match(/Path=\/api\/auth\/line\/callback/g)).toHaveLength(3);
  expect(cookies).not.toContain("channel-secret");
});

test("logout revokes the current session and clears the browser cookie", async () => {
  const rawToken = "r".repeat(43);
  const request = new NextRequest("https://app.example.com/api/auth/line/logout", {
    method: "POST",
    headers: {
      origin: "https://app.example.com",
      host: "app.example.com",
      cookie: `${CUSTOMER_SESSION_COOKIE_NAME}=${rawToken}`,
    },
  });
  const response = await logout(request);
  expect(boundary.revoke).toHaveBeenCalledExactlyOnceWith(rawToken);
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("https://app.example.com/");
  expect(response.headers.getSetCookie().join("\n")).toContain(`${CUSTOMER_SESSION_COOKIE_NAME}=;`);
  expect(response.headers.getSetCookie().join("\n")).toContain("Max-Age=0");
});

test("logout revoke failure returns a safe 503 and still clears the browser cookie", async () => {
  const rawToken = "r".repeat(43);
  const internalError = `database unavailable for ${rawToken}`;
  boundary.revoke.mockRejectedValue(new Error(internalError));
  const request = new NextRequest("https://app.example.com/api/auth/line/logout", {
    method: "POST",
    headers: {
      origin: "https://app.example.com",
      host: "app.example.com",
      cookie: `${CUSTOMER_SESSION_COOKIE_NAME}=${rawToken}`,
    },
  });
  const response = await logout(request);
  const body = await response.text();
  expect(boundary.revoke).toHaveBeenCalledExactlyOnceWith(rawToken);
  expect(response.status).toBe(503);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.getSetCookie().join("\n")).toContain(`${CUSTOMER_SESSION_COOKIE_NAME}=;`);
  expect(response.headers.getSetCookie().join("\n")).toContain("Max-Age=0");
  expect(body).toContain("登出失敗，請稍後再試。");
  expect(body).not.toContain(rawToken);
  expect(body).not.toContain(internalError);
});

test("logout rejects cross-origin POST before revocation", async () => {
  const request = new NextRequest("https://app.example.com/api/auth/line/logout", {
    method: "POST",
    headers: { origin: "https://attacker.example", host: "app.example.com" },
  });
  const response = await logout(request);
  expect(response.status).toBe(403);
  expect(boundary.revoke).not.toHaveBeenCalled();
});

test("logout accepts direct localhost when Origin and Host including port match", async () => {
  const request = new NextRequest("http://localhost:3000/api/auth/line/logout", {
    method: "POST",
    headers: { origin: "http://localhost:3000", host: "localhost:3000" },
  });
  const response = await logout(request);
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("http://localhost:3000/");
  expect(boundary.revoke).toHaveBeenCalledExactlyOnceWith(undefined);
});

test("logout accepts a public HTTPS origin behind a reverse proxy", async () => {
  const request = new NextRequest("http://localhost:3000/api/auth/line/logout", {
    method: "POST",
    headers: {
      origin: "https://example.trycloudflare.com",
      host: "localhost:3000",
      "x-forwarded-host": "example.trycloudflare.com",
      "x-forwarded-proto": "https",
    },
  });
  const response = await logout(request);
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("https://example.trycloudflare.com/");
  expect(boundary.revoke).toHaveBeenCalledExactlyOnceWith(undefined);
});

test.each([
  ["attacker origin", "https://evil.example", "example.trycloudflare.com", "https"],
  ["deceptive hostname", "https://example.trycloudflare.com.evil.example", "example.trycloudflare.com", "https"],
  ["wrong scheme", "http://example.trycloudflare.com", "example.trycloudflare.com", "https"],
  ["wrong port", "https://example.trycloudflare.com:444", "example.trycloudflare.com", "https"],
  ["missing origin", null, "example.trycloudflare.com", "https"],
] as const)("logout rejects %s", async (_name, origin, forwardedHost, forwardedProtocol) => {
  const headers = new Headers({
    host: "localhost:3000",
    "x-forwarded-host": forwardedHost,
    "x-forwarded-proto": forwardedProtocol,
  });
  if (origin !== null) headers.set("origin", origin);
  const response = await logout(new NextRequest("http://localhost:3000/api/auth/line/logout", {
    method: "POST",
    headers,
  }));
  expect(response.status).toBe(403);
  expect(boundary.revoke).not.toHaveBeenCalled();
});

test.each([
  ["credentialed origin", "https://user:password@example.trycloudflare.com", "example.trycloudflare.com", "https"],
  ["origin with a path", "https://example.trycloudflare.com/logout", "example.trycloudflare.com", "https"],
  ["ambiguous forwarded host", "https://example.trycloudflare.com", "example.trycloudflare.com, evil.example", "https"],
  ["ambiguous forwarded protocol", "https://example.trycloudflare.com", "example.trycloudflare.com", "https,http"],
] as const)("logout rejects malformed %s", async (_name, origin, forwardedHost, forwardedProtocol) => {
  const response = await logout(new NextRequest("http://localhost:3000/api/auth/line/logout", {
    method: "POST",
    headers: {
      origin,
      host: "localhost:3000",
      "x-forwarded-host": forwardedHost,
      "x-forwarded-proto": forwardedProtocol,
    },
  }));
  expect(response.status).toBe(403);
  expect(boundary.revoke).not.toHaveBeenCalled();
});
