import "server-only";

import { createHash, randomBytes } from "node:crypto";

/** 256 bits of CSPRNG entropy, encoded as unpadded base64url. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hash the raw token's UTF-8 representation for future storage. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
