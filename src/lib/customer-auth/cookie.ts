import "server-only";

export const CUSTOMER_SESSION_COOKIE_NAME = "customer_session";
export const LINE_OAUTH_STATE_COOKIE_NAME = "line_oauth_state";
export const LINE_OAUTH_NONCE_COOKIE_NAME = "line_oauth_nonce";
export const LINE_OAUTH_VERIFIER_COOKIE_NAME = "line_oauth_verifier";

export const LINE_OAUTH_COOKIE_PATH = "/api/auth/line/callback";
export const LINE_OAUTH_TTL_SECONDS = 10 * 60;

export function customerSessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export function lineOAuthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: LINE_OAUTH_COOKIE_PATH,
    maxAge: LINE_OAUTH_TTL_SECONDS,
  };
}

export function expiredLineOAuthCookieOptions() {
  return {
    ...lineOAuthCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  };
}
