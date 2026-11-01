import { randomUUID } from "node:crypto";

// Unique synthetic reference; each numeric run stays below the bank-account guard.
export function syntheticBankReference() {
  return `QA-${randomUUID().slice(0, 8)}-${randomUUID().slice(0, 8)}`;
}
