import "server-only";

import type { SevenElevenStore } from "@/lib/logistics/ecpay/store-map";

export const E2E_SEVEN_ELEVEN_STORE: SevenElevenStore = Object.freeze({
  id: "991234",
  name: "測試門市",
  address: "臺北市測試區安心路 7 號",
});

export function isEcpayE2eFixtureEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  if (environment.E2E_ECPAY_FIXTURE !== "1") return false;
  try {
    const databaseUrl = new URL(environment.DATABASE_URL ?? "");
    return /^\/my_group_buying_e2e_[a-f0-9]{32}$/.test(databaseUrl.pathname);
  } catch {
    return false;
  }
}
