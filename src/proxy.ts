import { NextRequest, NextResponse } from "next/server";
import { featureEnabled } from "@/lib/operations/config";
export function proxy(request: NextRequest) {
  if (!featureEnabled("STOREFRONT")) return new NextResponse("商城準備中，既有訂單請至我的訂單或聯絡客服。", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } });
  // Legacy order creation is closed in deployed environments; historic reads remain available.
  if (process.env.QBUY_ENV === "production" && request.method === "POST" && request.nextUrl.pathname.startsWith("/group-buys/")) return new NextResponse("舊制下單已停止。", { status: 403 });
  return NextResponse.next();
}
export const config = { matcher: ["/", "/group-buys/:path*", "/cart/:path*", "/checkout"] };
