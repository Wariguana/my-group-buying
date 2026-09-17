// @vitest-environment node

import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

const migrationPath = new URL(
  "../../prisma/migrations/20260918090000_add_order_number/migration.sql",
  import.meta.url,
);

test("migration deterministically backfills Taipei daily sequences and initializes their maxima", async () => {
  const sql = await readFile(migrationPath, "utf8");
  expect(sql).toContain("AT TIME ZONE 'Asia/Taipei'");
  expect(sql).toMatch(/PARTITION BY[\s\S]*ORDER BY "createdAt" ASC, "id" ASC/);
  expect(sql).toContain("row_number()");
  expect(sql).toMatch(/INSERT INTO "OrderNumberSequence"[\s\S]*MAX\(substring\("orderNumber" FROM 9 FOR 4\)::integer\)/);
  expect(sql).toContain('ALTER COLUMN "orderNumber" SET NOT NULL');
  expect(sql).toContain('CREATE UNIQUE INDEX "Order_orderNumber_key"');
  expect(sql).toContain("CHECK (\"orderNumber\" ~ '^[0-9]{12}$')");
  expect(sql).toContain("HAVING COUNT(*) > 9999");
});
