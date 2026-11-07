import { NextResponse } from "next/server";
import { featureEnabled } from "@/lib/operations/config";
export function proxy() {
  if (!featureEnabled("STOREFRONT")) return new NextResponse("商城準備中，既有訂單請至我的訂單或聯絡客服。", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } });
  return NextResponse.next();
}
export const config = { matcher: ["/", "/group-buys/:path*", "/cart/:path*", "/checkout"] };
