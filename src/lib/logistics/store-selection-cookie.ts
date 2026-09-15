import "server-only";

import { randomBytes } from "node:crypto";

export const STORE_SELECTION_BINDING_COOKIE = "seven_eleven_selection_binding";
export const STORE_SELECTION_BINDING_MAX_AGE_SECONDS = 60 * 60;
const STORE_SELECTION_BINDING_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isValidStoreSelectionBinding(value: unknown): value is string {
  return typeof value === "string" && STORE_SELECTION_BINDING_PATTERN.test(value);
}

export function createStoreSelectionBinding(): string {
  return randomBytes(32).toString("base64url");
}

export function storeSelectionBindingCookieOptions(
  maxAgeSeconds = STORE_SELECTION_BINDING_MAX_AGE_SECONDS,
) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
