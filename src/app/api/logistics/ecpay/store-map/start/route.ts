import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { publicGroupBuySlugSchema } from "@/lib/group-buys/public";
import { getSameRequestOrigin } from "@/lib/http/request-origin";
import { buildEcpayStoreMapRequest } from "@/lib/logistics/ecpay/store-map";
import { isEcpayE2eFixtureEnabled } from "@/lib/logistics/ecpay/e2e-fixture";
import {
  beginSevenElevenStoreSelection,
  getPendingSevenElevenMapRequest,
} from "@/lib/logistics/store-selection";
import {
  createStoreSelectionBinding,
  isValidStoreSelectionBinding,
  STORE_SELECTION_BINDING_COOKIE,
  storeSelectionBindingCookieOptions,
} from "@/lib/logistics/store-selection-cookie";

export const dynamic = "force-dynamic";

const autoSubmitScript = 'document.getElementById("ecpay-map").submit()';
const autoSubmitScriptHash = createHash("sha256").update(autoSubmitScript).digest("base64");

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export async function POST(request: NextRequest) {
  const requestOrigin = getSameRequestOrigin(request);
  if (!requestOrigin) {
    return new Response("Invalid store selection request.", {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response("Invalid store selection request.", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const entries = [...formData.entries()];
  const slug = entries.length === 1 && entries[0][0] === "groupBuySlug"
    ? publicGroupBuySlugSchema.safeParse(entries[0][1])
    : null;
  if (!slug?.success) {
    return new Response("Invalid store selection request.", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const existingBinding = request.cookies.get(STORE_SELECTION_BINDING_COOKIE)?.value;
    const browserBinding = isValidStoreSelectionBinding(existingBinding)
      ? existingBinding
      : createStoreSelectionBinding();
    const { state } = await beginSevenElevenStoreSelection(slug.data, browserBinding);
    const pending = await getPendingSevenElevenMapRequest(state);
    if (!pending) throw new Error("STORE_SELECTION_UNAVAILABLE");
    const map = buildEcpayStoreMapRequest(pending.merchantTradeNo, pending.state);
    const action = isEcpayE2eFixtureEnabled()
      ? "/api/logistics/ecpay/store-map/test-fixture"
      : map.action;
    const inputs = Object.entries(map.fields)
      .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
      .join("");
    const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>前往 7-ELEVEN 門市選擇</title></head><body><main><p>正在前往 7-ELEVEN 門市選擇…</p><form id="ecpay-map" method="post" action="${escapeHtml(action)}">${inputs}<button type="submit">繼續選擇門市</button></form></main><script>${autoSubmitScript}</script></body></html>`;
    const formOrigin = new URL(action, requestOrigin).origin;
    const response = new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": `default-src 'none'; script-src 'sha256-${autoSubmitScriptHash}'; form-action ${formOrigin}`,
        "Referrer-Policy": "no-referrer",
      },
    });
    response.cookies.set(
      STORE_SELECTION_BINDING_COOKIE,
      browserBinding,
      storeSelectionBindingCookieOptions(),
    );
    return response;
  } catch {
    const url = new URL(`/group-buys/${encodeURIComponent(slug.data)}`, requestOrigin);
    url.searchParams.set("storeSelectionError", "unavailable");
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
