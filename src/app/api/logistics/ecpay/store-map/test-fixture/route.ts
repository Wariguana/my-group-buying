import { E2E_SEVEN_ELEVEN_STORE, isEcpayE2eFixtureEnabled } from "@/lib/logistics/ecpay/e2e-fixture";

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export async function POST(request: Request) {
  if (!isEcpayE2eFixtureEnabled()) return new Response("Not found.", { status: 404 });
  const source = await request.formData();
  const passthrough = ["MerchantID", "MerchantTradeNo", "LogisticsSubType", "ExtraData"] as const;
  const values: Record<string, string> = {};
  for (const field of passthrough) {
    const entries = source.getAll(field);
    if (entries.length !== 1 || typeof entries[0] !== "string") return new Response("Invalid fixture request.", { status: 400 });
    values[field] = entries[0];
  }
  const fields = {
    ...values,
    CVSStoreID: E2E_SEVEN_ELEVEN_STORE.id,
    CVSStoreName: E2E_SEVEN_ELEVEN_STORE.name,
    CVSAddress: E2E_SEVEN_ELEVEN_STORE.address,
  };
  const inputs = Object.entries(fields).map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`).join("");
  return new Response(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>測試門市選擇</title></head><body><main><h1>7-ELEVEN 測試門市</h1><p>${escapeHtml(E2E_SEVEN_ELEVEN_STORE.name)}／${escapeHtml(E2E_SEVEN_ELEVEN_STORE.address)}</p><form method="post" action="/api/logistics/ecpay/store-map/callback">${inputs}<button type="submit">選擇測試 7-ELEVEN 門市</button></form></main></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; form-action 'self'" },
  });
}
