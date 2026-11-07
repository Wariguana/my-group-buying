// @vitest-environment node

import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("LINE login uses native navigation for the OAuth route handler", async () => {
  const publicUi = await source("src/app/storefront-header.tsx");

  expect(publicUi).toContain('href="/api/auth/line/start"');
  expect(publicUi).toMatch(
    /<a\b[^>]*\bhref\s*=\s*["']\/api\/auth\/line\/start["'][^>]*>[\s\S]*?LINE 登入[\s\S]*?<\/a>/,
  );
  expect(publicUi).not.toMatch(
    /<Link\b[^>]*\bhref\s*=\s*["']\/api\/auth\/line\/start["']/,
  );
});

test("public query source cannot make DRAFT or CANCELLED records public or expose cost and supplier fields", async () => {
  const service = await source("src/lib/group-buys/public-service.ts");
  expect(service).toContain('status: "PUBLISHED"');
  expect(service).not.toContain('status: "DRAFT"');
  expect(service).not.toContain('status: "CANCELLED"');
  expect(service).not.toMatch(/\bcost\s*:/);
  expect(service).not.toMatch(/\bsupplier\s*:/);
});
