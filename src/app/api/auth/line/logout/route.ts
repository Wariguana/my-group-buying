import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  CUSTOMER_SESSION_COOKIE_NAME,
  customerSessionCookieOptions,
} from "@/lib/customer-auth/cookie";
import { revokeCustomerSession } from "@/lib/customer-auth/session";
import { getSameRequestOrigin } from "@/lib/http/request-origin";

function clearCustomerSessionCookie(response: NextResponse) {
  response.cookies.set(CUSTOMER_SESSION_COOKIE_NAME, "", {
    ...customerSessionCookieOptions(new Date(0)),
    maxAge: 0,
  });
}

export async function POST(request: NextRequest) {
  const requestOrigin = getSameRequestOrigin(request);
  if (!requestOrigin) {
    return NextResponse.json({ error: "無法驗證登出來源。" }, { status: 403 });
  }

  try {
    await revokeCustomerSession(request.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value);
  } catch {
    const response = NextResponse.json(
      { error: "登出失敗，請稍後再試。" },
      { status: 503 },
    );
    clearCustomerSessionCookie(response);
    return response;
  }
  const response = NextResponse.redirect(new URL("/", requestOrigin), 303);
  clearCustomerSessionCookie(response);
  return response;
}
