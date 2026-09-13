import "server-only";

export const CANONICAL_TAIWAN_MOBILE_PATTERN = /^\+8869[0-9]{8}$/;

const OUTER_ASCII_WHITESPACE = /^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g;

export function canonicalizeTaiwanMobilePhone(value: string): string | null {
  const compact = value
    .replace(OUTER_ASCII_WHITESPACE, "")
    .replace(/[ -]/g, "");

  const canonical = /^09[0-9]{8}$/.test(compact)
    ? `+886${compact.slice(1)}`
    : compact;

  return CANONICAL_TAIWAN_MOBILE_PATTERN.test(canonical) ? canonical : null;
}
