import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const LINE_AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
const LINE_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

const tokenResponseSchema = z.object({ id_token: z.string().min(1) });
const verifiedIdentitySchema = z.object({
  iss: z.literal("https://access.line.me"),
  sub: z.string().min(1).max(255),
  aud: z.string().min(1),
  exp: z.number().int().safe().positive().max(253_402_300_799),
  nonce: z.string().min(1),
  name: z.string().max(255).optional(),
  picture: z.url().max(2048).optional(),
});

export type VerifiedLineIdentity = Readonly<{
  lineUserId: string;
  displayName: string | null;
  pictureUrl: string | null;
}>;

export type LineLoginConfiguration = Readonly<{
  channelId: string;
  channelSecret: string;
  redirectUri: string;
}>;

export class LineLoginError extends Error {
  constructor(public readonly code: "TOKEN_EXCHANGE_FAILED" | "ID_TOKEN_VERIFICATION_FAILED") {
    super(code);
    this.name = "LineLoginError";
  }
}

export function readLineLoginConfiguration(
  environment: Record<string, string | undefined> = process.env,
): LineLoginConfiguration {
  const channelId = environment.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = environment.LINE_LOGIN_CHANNEL_SECRET;
  const redirectUri = environment.LINE_LOGIN_REDIRECT_URI;
  if (!channelId || channelId.trim() !== channelId) throw new Error("LINE Login configuration is invalid.");
  if (!channelSecret || channelSecret.trim() !== channelSecret) throw new Error("LINE Login configuration is invalid.");
  if (!redirectUri || redirectUri.trim() !== redirectUri) throw new Error("LINE Login configuration is invalid.");
  try {
    const parsed = new URL(redirectUri);
    if (
      parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || parsed.hash
      || parsed.search
      || parsed.pathname !== "/api/auth/line/callback"
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("LINE Login configuration is invalid.");
  }
  return Object.freeze({ channelId, channelSecret, redirectUri });
}

function randomBase64Url(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function createLineAuthorizationRequest(configuration = readLineLoginConfiguration()) {
  const state = randomBase64Url();
  const nonce = randomBase64Url();
  const codeVerifier = randomBase64Url();
  const codeChallenge = createHash("sha256").update(codeVerifier, "utf8").digest("base64url");
  const authorizationUrl = new URL(LINE_AUTHORIZE_URL);
  authorizationUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: configuration.channelId,
    redirect_uri: configuration.redirectUri,
    state,
    scope: "openid profile",
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return { authorizationUrl, state, nonce, codeVerifier };
}

export function matchesOAuthState(receivedState: unknown, issuedState: unknown): boolean {
  if (typeof receivedState !== "string" || typeof issuedState !== "string") return false;
  const received = Buffer.from(receivedState, "utf8");
  const issued = Buffer.from(issuedState, "utf8");
  return received.length === issued.length && timingSafeEqual(received, issued);
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchVerifiedLineIdentity(
  input: Readonly<{ code: string; nonce: string; codeVerifier: string }>,
  dependencies: Readonly<{ fetch: typeof fetch }> = { fetch },
  configuration = readLineLoginConfiguration(),
): Promise<VerifiedLineIdentity> {
  let tokenResponse: Response;
  try {
    tokenResponse = await dependencies.fetch(LINE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: configuration.redirectUri,
        client_id: configuration.channelId,
        client_secret: configuration.channelSecret,
        code_verifier: input.codeVerifier,
      }),
      cache: "no-store",
    });
  } catch {
    throw new LineLoginError("TOKEN_EXCHANGE_FAILED");
  }
  const tokenPayload = tokenResponse.ok
    ? tokenResponseSchema.safeParse(await parseJson(tokenResponse))
    : null;
  if (!tokenPayload || !tokenPayload.success) throw new LineLoginError("TOKEN_EXCHANGE_FAILED");

  let verifyResponse: Response;
  try {
    verifyResponse = await dependencies.fetch(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        id_token: tokenPayload.data.id_token,
        client_id: configuration.channelId,
        nonce: input.nonce,
      }),
      cache: "no-store",
    });
  } catch {
    throw new LineLoginError("ID_TOKEN_VERIFICATION_FAILED");
  }
  const verified = verifyResponse.ok
    ? verifiedIdentitySchema.safeParse(await parseJson(verifyResponse))
    : null;
  if (
    !verified
    || !verified.success
    || verified.data.aud !== configuration.channelId
    || verified.data.nonce !== input.nonce
    || verified.data.exp * 1000 <= Date.now()
  ) {
    throw new LineLoginError("ID_TOKEN_VERIFICATION_FAILED");
  }
  return {
    lineUserId: verified.data.sub,
    displayName: verified.data.name ?? null,
    pictureUrl: verified.data.picture ?? null,
  };
}
