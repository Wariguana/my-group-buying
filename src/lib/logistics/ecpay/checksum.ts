import "server-only";

import { createHash } from "node:crypto";

function ecpayUrlEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/%2D/gi, "-")
    .replace(/%5F/gi, "_")
    .replace(/%2E/gi, ".")
    .replace(/%21/gi, "!")
    .replace(/%2A/gi, "*")
    .replace(/%28/gi, "(")
    .replace(/%29/gi, ")")
    .toLowerCase();
}

export function createEcpayLogisticsCheckMacValue(
  parameters: Readonly<Record<string, string>>,
  hashKey: string,
  hashIv: string,
): string {
  const serialized = Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right, "en", { sensitivity: "base" }))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const encoded = ecpayUrlEncode(`HashKey=${hashKey}&${serialized}&HashIV=${hashIv}`);
  return createHash("md5").update(encoded, "utf8").digest("hex").toUpperCase();
}
