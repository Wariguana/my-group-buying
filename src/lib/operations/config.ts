type Environment = Record<string, string | undefined>;
export type Feature = "STOREFRONT" | "LOGIN" | "CHECKOUT" | "BANK_DETAILS" | "SEVEN_ELEVEN" | "FAMILY_MART" | "HOME_DELIVERY" | "LINE_PUSH" | "LOGISTICS_EXTERNAL";
export function isolatedTest(env: Environment = process.env) {
  try { const u = new URL(env.DATABASE_URL ?? ""); return env.QBUY_ENV === "test" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) && /^\/my_group_buying_e2e_[a-f0-9]{32}$/.test(u.pathname); } catch { return false; }
}
export function featureEnabled(feature: Feature, env: Environment = process.env): boolean {
  if (env.NODE_ENV === "production" && !["production", "staging"].includes(env.QBUY_ENV ?? "") && !isolatedTest(env)) return false;
  const value = env[`QBUY_ENABLE_${feature}`];
  if (feature === "LINE_PUSH" || feature === "LOGISTICS_EXTERNAL") return env.QBUY_ENV === "production" && value === "true";
  if (value !== undefined) return value === "true";
  return env.QBUY_ENV !== "production" && env.QBUY_ENV !== "staging" && (env.NODE_ENV !== "production" || isolatedTest(env));
}
export function assertDeployment(env: Environment = process.env) {
  if (isolatedTest(env)) return;
  if (!["staging", "production"].includes(env.QBUY_ENV ?? "")) throw new Error("DEPLOYMENT_ENV_REQUIRED");
  if (env.NODE_ENV !== "production") throw new Error("PRODUCTION_NODE_REQUIRED");
  for (const [key, value] of Object.entries(env)) {
    if ((key.startsWith("E2E_") || key === "NEXT_DEV_ALLOWED_ORIGIN") && value) throw new Error("TEST_CONFIGURATION_FORBIDDEN");
  }
  const origin = new URL(env.APP_BASE_URL ?? "");
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || /(^|\.)trycloudflare\.com$/.test(origin.hostname)) throw new Error("FIXED_HTTPS_ORIGIN_REQUIRED");
  const db = new URL(env.DATABASE_URL ?? "");
  if (!/^postgres(ql)?:$/.test(db.protocol) || /(_dev|_e2e_|^\/ci$)/.test(db.pathname)) throw new Error("ISOLATED_DATABASE_REQUIRED");
  if (env.QBUY_ENV === "staging" && (env.LINE_MESSAGING_ENABLED === "true" || env.ECPAY_LOGISTICS_ENVIRONMENT === "production" || env.QBUY_ENABLE_LINE_PUSH === "true" || env.QBUY_ENABLE_LOGISTICS_EXTERNAL === "true")) throw new Error("STAGING_EXTERNAL_EFFECT_FORBIDDEN");
  if (featureEnabled("LOGIN", env) && env.LINE_LOGIN_REDIRECT_URI !== `${origin.origin}/api/auth/line/callback`) throw new Error("LOGIN_CALLBACK_MISMATCH");
  if (featureEnabled("CHECKOUT", env)) {
    if (!featureEnabled("BANK_DETAILS", env) || !featureEnabled("LOGIN", env) || env.QBUY_COMMERCE_APPROVAL !== "approved" || !["SEVEN_ELEVEN", "FAMILY_MART", "HOME_DELIVERY"].some(f => featureEnabled(f as Feature, env))) throw new Error("COMMERCE_APPROVAL_REQUIRED");
  }
}
