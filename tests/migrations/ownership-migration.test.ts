// @vitest-environment node

import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("Order owner migration is nullable, indexed, SetNull, and never backfills by phone", async () => {
  const sql = await readFile(
    new URL("../../prisma/migrations/20260922090000_add_order_customer_account_owner/migration.sql", import.meta.url),
    "utf8",
  );
  expect(sql).toContain('ADD COLUMN "customerAccountId" UUID');
  expect(sql).not.toMatch(/"customerAccountId" UUID NOT NULL/i);
  expect(sql).toContain('CREATE INDEX "Order_customerAccountId_createdAt_idx"');
  expect(sql).toContain('REFERENCES "CustomerAccount"("id")');
  expect(sql).toContain("ON DELETE SET NULL");
  expect(sql).not.toMatch(/\bUPDATE\s+"?Order"?/i);
  expect(sql).not.toMatch(/phone|customerName|displayName/i);
  expect(sql).not.toMatch(/\bDROP\b/i);
});
