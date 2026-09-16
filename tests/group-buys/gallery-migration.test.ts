// @vitest-environment node

import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("gallery migration creates both tables, backfills one legacy cover at sort zero, and removes the old source", async () => {
  const migration = await readFile(new URL("../../prisma/migrations/20260916150000_add_group_buy_gallery/migration.sql", import.meta.url), "utf8");
  expect(migration).toContain('CREATE TABLE "GroupBuyImage"');
  expect(migration).toContain('CREATE TABLE "PendingGroupBuyImageUpload"');
  expect(migration).toMatch(/INSERT INTO "GroupBuyImage"[\s\S]*SELECT gen_random_uuid\(\), "id", "coverImageUrl", NULL, 0/);
  expect(migration).toContain('WHERE "coverImageUrl" IS NOT NULL');
  expect(migration).toContain('ALTER TABLE "GroupBuy" DROP COLUMN "coverImageUrl"');
  expect(migration).not.toMatch(/UPDATE "GroupBuy"|DELETE FROM "GroupBuy"/);
});
