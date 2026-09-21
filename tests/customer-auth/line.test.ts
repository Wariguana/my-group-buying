// @vitest-environment node

import { createHash } from "node:crypto";
import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  LineLoginError,
  createLineAuthorizationRequest,
  fetchVerifiedLineIdentity,
  matchesOAuthState,
  readLineLoginConfiguration,
} from "@/lib/customer-auth/line";

const configuration = {
  channelId: "channel-id",
  channelSecret: "channel-secret",
  redirectUri: "https://login.example.com/api/auth/line/callback",
};

function verifiedPayload(overrides: Record<string, unknown> = {}) {
  return {
    iss: "https://access.line.me",
    sub: "verified-line-sub",
    aud: configuration.channelId,
    exp: Math.floor(Date.now() / 1000) + 600,
    nonce: "issued-nonce",
    name: "LINE name",
    picture: "https://profile.example.com/avatar.png",
    ...overrides,
  };
}

test("authorization URL contains random state, nonce, OpenID profile scope, and PKCE S256", () => {
  const first = createLineAuthorizationRequest(configuration);
  const second = createLineAuthorizationRequest(configuration);
  const params = first.authorizationUrl.searchParams;

  expect(first.authorizationUrl.origin + first.authorizationUrl.pathname)
    .toBe("https://access.line.me/oauth2/v2.1/authorize");
  expect(params.get("response_type")).toBe("code");
  expect(params.get("client_id")).toBe(configuration.channelId);
  expect(params.get("redirect_uri")).toBe(configuration.redirectUri);
  expect(params.get("scope")).toBe("openid profile");
  expect(params.get("state")).toBe(first.state);
  expect(params.get("nonce")).toBe(first.nonce);
  expect(params.get("code_challenge_method")).toBe("S256");
  expect(params.get("code_challenge")).toBe(
    createHash("sha256").update(first.codeVerifier, "utf8").digest("base64url"),
  );
  expect(first.state).not.toBe(second.state);
  expect(first.nonce).not.toBe(second.nonce);
  expect(first.codeVerifier).not.toBe(second.codeVerifier);
  expect(first.authorizationUrl.search).not.toContain(configuration.channelSecret);
});

test("state comparison fails closed for missing, mismatched, and length-mismatched values", () => {
  expect(matchesOAuthState("issued", "issued")).toBe(true);
  expect(matchesOAuthState("attacker", "issued")).toBe(false);
  expect(matchesOAuthState("short", "much-longer")).toBe(false);
  expect(matchesOAuthState(undefined, "issued")).toBe(false);
  expect(matchesOAuthState("issued", undefined)).toBe(false);
});

test("token exchange sends the PKCE verifier and only verified sub becomes identity", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id_token: "signed-id-token", access_token: "unused" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(verifiedPayload()), { status: 200 }));

  await expect(fetchVerifiedLineIdentity(
    { code: "authorization-code", nonce: "issued-nonce", codeVerifier: "issued-verifier" },
    { fetch: fetchMock },
    configuration,
  )).resolves.toEqual({
    lineUserId: "verified-line-sub",
    displayName: "LINE name",
    pictureUrl: "https://profile.example.com/avatar.png",
  });

  const tokenBody = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.line.me/oauth2/v2.1/token");
  expect(tokenBody.get("code_verifier")).toBe("issued-verifier");
  expect(tokenBody.get("client_secret")).toBe(configuration.channelSecret);
  const verifyBody = fetchMock.mock.calls[1][1]?.body as URLSearchParams;
  expect(fetchMock.mock.calls[1][0]).toBe("https://api.line.me/oauth2/v2.1/verify");
  expect(verifyBody.get("id_token")).toBe("signed-id-token");
  expect(verifyBody.get("client_id")).toBe(configuration.channelId);
  expect(verifyBody.get("nonce")).toBe("issued-nonce");
});

test("missing id_token fails closed before verification", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ access_token: "not-an-id-token" }), { status: 200 }),
  );
  await expect(fetchVerifiedLineIdentity(
    { code: "code", nonce: "nonce", codeVerifier: "verifier" },
    { fetch: fetchMock },
    configuration,
  )).rejects.toMatchObject({ code: "TOKEN_EXCHANGE_FAILED" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("failed or malformed ID-token verification is rejected", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id_token: "id-token" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ name: "No sub" }), { status: 200 }));
  await expect(fetchVerifiedLineIdentity(
    { code: "code", nonce: "nonce", codeVerifier: "verifier" },
    { fetch: fetchMock },
    configuration,
  )).rejects.toEqual(new LineLoginError("ID_TOKEN_VERIFICATION_FAILED"));
});

test.each([
  ["issuer mismatch", { iss: "https://attacker.example" }],
  ["audience mismatch", { aud: "other-channel" }],
  ["nonce mismatch", { nonce: "other-nonce" }],
  ["non-integer expiry", { exp: 123.5 }],
  ["non-numeric expiry", { exp: "tomorrow" }],
  ["expired timestamp", { exp: Math.floor(Date.now() / 1000) - 1 }],
] as const)("verified response rejects %s", async (_name, overrides) => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id_token: "id-token" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(verifiedPayload(overrides)), { status: 200 }));
  await expect(fetchVerifiedLineIdentity(
    { code: "code", nonce: "issued-nonce", codeVerifier: "verifier" },
    { fetch: fetchMock },
    configuration,
  )).rejects.toEqual(new LineLoginError("ID_TOKEN_VERIFICATION_FAILED"));
});

test("configuration validates server-only fields and redirect URI", () => {
  expect(readLineLoginConfiguration({
    LINE_LOGIN_CHANNEL_ID: configuration.channelId,
    LINE_LOGIN_CHANNEL_SECRET: configuration.channelSecret,
    LINE_LOGIN_REDIRECT_URI: configuration.redirectUri,
  })).toEqual(configuration);
  expect(() => readLineLoginConfiguration({})).toThrow("LINE Login configuration is invalid.");
  expect(() => readLineLoginConfiguration({
    LINE_LOGIN_CHANNEL_ID: configuration.channelId,
    LINE_LOGIN_CHANNEL_SECRET: configuration.channelSecret,
    LINE_LOGIN_REDIRECT_URI: "javascript:alert(1)",
  })).toThrow("LINE Login configuration is invalid.");
  expect(() => readLineLoginConfiguration({
    LINE_LOGIN_CHANNEL_ID: configuration.channelId,
    LINE_LOGIN_CHANNEL_SECRET: configuration.channelSecret,
    LINE_LOGIN_REDIRECT_URI: "http://login.example.com/api/auth/line/callback",
  })).toThrow("LINE Login configuration is invalid.");
});
