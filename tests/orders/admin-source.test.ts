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

test("pickup boundaries keep server authority and customer credentials out of the browser", async () => {
  const action = await source("src/app/admin/(protected)/orders/[publicCode]/pickup-actions.ts");
  const form = await source("src/app/admin/(protected)/orders/[publicCode]/pickup-form.tsx");
  const service = await source("src/lib/orders/pickup-service.ts");
  expect(action).toContain('"use server"');
  expect(action).toContain("await requireAdmin()");
  expect(action).toContain("markOrderPickedUpAsAdmin(publicCode)");
  expect(`${action}\n${form}`).not.toMatch(/getDb|Prisma|\$transaction|updateMany|accessToken|managementCode/);
  expect(form).not.toMatch(/pickup-service|requireAdmin|isAdmin|bypassCutoff/);
  expect(service).toContain('import "server-only"');
  expect(service).not.toMatch(/groupBuyItem|pickupLocation|accessToken|\.product|endAt/);
});

test("Admin cancellation boundaries contain no persistence logic or customer credentials", async () => {
  const action = await source("src/app/admin/(protected)/orders/[publicCode]/cancel-actions.ts");
  const form = await source("src/app/admin/(protected)/orders/[publicCode]/cancel-form.tsx");
  expect(action).toContain('"use server"');
  expect(action).toContain("await requireAdmin()");
  expect(action).toContain("cancelOrderAsAdmin(publicCode)");
  expect(`${action}\n${form}`).not.toMatch(/getDb|Prisma|\$transaction|updateMany|accessToken|managementCode/);
  expect(form).not.toMatch(/cancel-service|requireAdmin|ignoreCutoff|isAdmin|bypassCutoff/);
});
