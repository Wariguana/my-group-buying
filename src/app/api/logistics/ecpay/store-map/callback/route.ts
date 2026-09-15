import { NextResponse } from "next/server";
import { completeSevenElevenStoreSelection } from "@/lib/logistics/store-selection";

const requiredFields = [
  "MerchantID",
  "MerchantTradeNo",
  "LogisticsSubType",
  "CVSStoreID",
  "CVSStoreName",
  "CVSAddress",
  "ExtraData",
] as const;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response("Invalid callback.", { status: 400 });
  }
  const callback: Record<string, string> = {};
  for (const field of requiredFields) {
    const values = formData.getAll(field);
    if (values.length !== 1 || typeof values[0] !== "string") {
      return new Response("Invalid callback.", { status: 400 });
    }
    callback[field] = values[0];
  }

  let completed;
  try {
    completed = await completeSevenElevenStoreSelection(callback);
  } catch {
    return new Response("Store verification failed.", { status: 502 });
  }
  if (!completed) return new Response("Invalid or expired callback.", { status: 400 });

  const url = new URL(`/group-buys/${encodeURIComponent(completed.slug)}`, request.url);
  url.searchParams.set("storeSelection", completed.selectionToken);
  return NextResponse.redirect(url, 303);
}
