// @vitest-environment node

import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("admin order pages use the protected boundary and dedicated server-only read service", async () => {
  const [listPage, detailPage, layout, service] = await Promise.all([
    source("src/app/admin/(protected)/orders/page.tsx"),
    source("src/app/admin/(protected)/orders/[publicCode]/page.tsx"),
    source("src/app/admin/(protected)/layout.tsx"),
    source("src/lib/orders/admin-service.ts"),
  ]);
  expect(layout).toContain('href="/admin/orders"');
  expect(listPage).toContain("await requireAdmin()");
  expect(detailPage).toContain("await requireAdmin()");
  expect(detailPage).toContain("notFound()");
  expect(`${listPage}\n${detailPage}`).not.toMatch(/\bgetDb\b|accessTokenHash/);
  expect(service).toContain('import "server-only"');
  expect(service).not.toContain("hashOrderAccessToken");
  expect(service).not.toContain("getOrderForAccess");
  expect(service).not.toMatch(/\bcost\s*:/);
});

test("customer order access remains token-scoped", async () => {
  const service = await source("src/lib/orders/access-service.ts");
  expect(service).toContain("accessTokenHash: hashOrderAccessToken(rawToken)");
  expect(service).toContain("isValidOrderAccessToken(rawToken)");
});
