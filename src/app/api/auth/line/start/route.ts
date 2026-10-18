import { enforceRateLimit } from "@/lib/operations/rate-limit";
import { featureEnabled } from "@/lib/operations/config";
import { NextResponse } from "next/server";
import {
  LINE_OAUTH_NONCE_COOKIE_NAME,
  LINE_OAUTH_STATE_COOKIE_NAME,
  LINE_OAUTH_VERIFIER_COOKIE_NAME,
  lineOAuthCookieOptions,
} from "@/lib/customer-auth/cookie";
import { createLineAuthorizationRequest } from "@/lib/customer-auth/line";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!featureEnabled("LOGIN")) return NextResponse.json({ error: "LINE 登入暫停開放。" }, { status: 503 });
  try {
    await enforceRateLimit("line-login", "global", 120);
    const request = createLineAuthorizationRequest();
    const response = NextResponse.redirect(request.authorizationUrl);
    const options = lineOAuthCookieOptions();
    response.cookies.set(LINE_OAUTH_STATE_COOKIE_NAME, request.state, options);
    response.cookies.set(LINE_OAUTH_NONCE_COOKIE_NAME, request.nonce, options);
    response.cookies.set(LINE_OAUTH_VERIFIER_COOKIE_NAME, request.codeVerifier, options);
    return response;
  } catch {
    return NextResponse.json({ error: "LINE 登入目前無法使用。" }, { status: 503 });
  }
}
