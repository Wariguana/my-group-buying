import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  CUSTOMER_SESSION_COOKIE_NAME,
  LINE_OAUTH_NONCE_COOKIE_NAME,
  LINE_OAUTH_STATE_COOKIE_NAME,
  LINE_OAUTH_VERIFIER_COOKIE_NAME,
  customerSessionCookieOptions,
  expiredLineOAuthCookieOptions,
} from "@/lib/customer-auth/cookie";
import {
  LineLoginError,
  fetchVerifiedLineIdentity,
  matchesOAuthState,
} from "@/lib/customer-auth/line";
import { createCustomerSession } from "@/lib/customer-auth/session";
import { getRequestTargetOrigin } from "@/lib/http/request-origin";

export const dynamic = "force-dynamic";

type CallbackError =
  | "denied"
  | "invalid_state"
  | "token_exchange_failed"
  | "id_token_verification_failed"
  | "login_failed";

function hasExactlyOne(params: URLSearchParams, name: string): boolean {
  return params.getAll(name).length === 1;
}

function isOAuthSecret(value: unknown): value is string {
  return typeof value === "string" && value.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function redirectHome(requestTargetOrigin: URL, error?: CallbackError) {
  const url = new URL("/", requestTargetOrigin);
  if (error) url.searchParams.set("line_login", error);
  return NextResponse.redirect(url, 303);
}

function clearTransientCookies(response: NextResponse) {
  const options = expiredLineOAuthCookieOptions();
  response.cookies.set(LINE_OAUTH_STATE_COOKIE_NAME, "", options);
  response.cookies.set(LINE_OAUTH_NONCE_COOKIE_NAME, "", options);
  response.cookies.set(LINE_OAUTH_VERIFIER_COOKIE_NAME, "", options);
}

export async function GET(request: NextRequest) {
  const requestTargetOrigin = getRequestTargetOrigin(request);
  if (!requestTargetOrigin) {
    const response = NextResponse.json(
      { error: "無法驗證 LINE 登入回呼來源。" },
      { status: 400 },
    );
    clearTransientCookies(response);
    return response;
  }

  const params = request.nextUrl.searchParams;
  const issuedState = request.cookies.get(LINE_OAUTH_STATE_COOKIE_NAME)?.value;
  const nonce = request.cookies.get(LINE_OAUTH_NONCE_COOKIE_NAME)?.value;
  const codeVerifier = request.cookies.get(LINE_OAUTH_VERIFIER_COOKIE_NAME)?.value;
  let response: NextResponse;

  const state = hasExactlyOne(params, "state") ? params.get("state") : null;
  if (
    !isOAuthSecret(state)
    || !isOAuthSecret(issuedState)
    || !matchesOAuthState(state, issuedState)
  ) {
    response = redirectHome(requestTargetOrigin, "invalid_state");
  } else if (params.has("error")) {
    response = redirectHome(requestTargetOrigin, "denied");
  } else {
    const code = hasExactlyOne(params, "code") ? params.get("code") : null;
    if (
      !code
      || !isOAuthSecret(nonce)
      || !isOAuthSecret(codeVerifier)
    ) {
      response = redirectHome(requestTargetOrigin, "invalid_state");
    } else {
      try {
        const identity = await fetchVerifiedLineIdentity({ code, nonce, codeVerifier });
        const session = await createCustomerSession(identity);
        response = redirectHome(requestTargetOrigin);
        response.cookies.set(
          CUSTOMER_SESSION_COOKIE_NAME,
          session.token,
          customerSessionCookieOptions(session.expiresAt),
        );
      } catch (error) {
        const errorCode: CallbackError = error instanceof LineLoginError
          ? error.code === "TOKEN_EXCHANGE_FAILED"
            ? "token_exchange_failed"
            : "id_token_verification_failed"
          : "login_failed";
        response = redirectHome(requestTargetOrigin, errorCode);
      }
    }
  }

  clearTransientCookies(response);
  return response;
}
