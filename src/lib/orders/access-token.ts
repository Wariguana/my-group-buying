import "server-only";

import { createHash, randomBytes } from "node:crypto";

export const ORDER_ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** 256 bits of CSPRNG entropy, encoded as unpadded base64url. */
export function generateOrderAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hash the bearer token before persistence. */
export function hashOrderAccessToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function isValidOrderAccessToken(value: unknown): value is string {
  return typeof value === "string" && ORDER_ACCESS_TOKEN_PATTERN.test(value);
}
