// @vitest-environment node

import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("LINE account migration is additive and does not alter Customer or Order ownership", async () => {
  const sql = await readFile(
    new URL("../../prisma/migrations/20260921173636_add_customer_line_accounts/migration.sql", import.meta.url),
    "utf8",
  );
  expect(sql).toContain('CREATE TABLE "CustomerAccount"');
  expect(sql).toContain('CREATE TABLE "CustomerSession"');
  expect(sql).toContain('UNIQUE INDEX "CustomerAccount_lineUserId_key"');
  expect(sql).not.toMatch(/ALTER TABLE "Customer"/);
  expect(sql).not.toMatch(/ALTER TABLE "Order"/);
  expect(sql).not.toMatch(/\bDROP\b/);
});
