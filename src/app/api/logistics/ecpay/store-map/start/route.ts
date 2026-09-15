import { buildEcpayStoreMapRequest } from "@/lib/logistics/ecpay/store-map";
import { isEcpayE2eFixtureEnabled } from "@/lib/logistics/ecpay/e2e-fixture";
import { getPendingSevenElevenMapRequest } from "@/lib/logistics/store-selection";

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export async function GET(request: Request) {
  const state = new URL(request.url).searchParams.get("state");
  const pending = await getPendingSevenElevenMapRequest(state);
  if (!pending) return new Response("Store selection is unavailable.", { status: 404 });
  const map = buildEcpayStoreMapRequest(pending.merchantTradeNo, pending.state);
  const action = isEcpayE2eFixtureEnabled()
    ? "/api/logistics/ecpay/store-map/test-fixture"
    : map.action;
  const inputs = Object.entries(map.fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("");
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>前往 7-ELEVEN 門市選擇</title></head><body><main><p>正在前往 7-ELEVEN 門市選擇…</p><form id="ecpay-map" method="post" action="${escapeHtml(action)}">${inputs}<button type="submit">繼續選擇門市</button></form></main><script>document.getElementById("ecpay-map").submit()</script></body></html>`;
  const formOrigin = new URL(action, request.url).origin;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action ${formOrigin}`,
      "Referrer-Policy": "no-referrer",
    },
  });
}
