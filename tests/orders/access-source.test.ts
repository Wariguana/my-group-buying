// @vitest-environment node

import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("order page delegates authorization and database access to the server-only service", async () => {
  const [page, form, action, service] = await Promise.all([
    source("src/app/orders/[publicCode]/page.tsx"),
    source("src/app/orders/[publicCode]/access-form.tsx"),
    source("src/app/orders/[publicCode]/actions.ts"),
    source("src/lib/orders/access-service.ts"),
  ]);
  expect(page).toContain("getOrderForAccess(publicCode, rawToken)");
  expect(page).not.toMatch(/\bPrisma\b|\bgetDb\b/);
  expect(form).not.toMatch(/\bPrisma\b|\bgetDb\b|accessTokenHash/);
  expect(action).not.toMatch(/\bPrisma\b|\bgetDb\b/);
  expect(service).toContain('import "server-only"');
  expect(service).toContain("accessTokenHash: hashOrderAccessToken(rawToken)");
});

test("management token is never placed in a URL and no phone-based authorization exists", async () => {
  const [page, form, action] = await Promise.all([
    source("src/app/orders/[publicCode]/page.tsx"),
    source("src/app/orders/[publicCode]/access-form.tsx"),
    source("src/app/orders/[publicCode]/actions.ts"),
  ]);
  const routeSource = `${page}\n${form}\n${action}`;
  expect(action).toContain("redirect(`/orders/${publicCode}`)");
  expect(action).not.toMatch(/redirect\([^)]*managementCode/);
  expect(routeSource).not.toContain('name="customerPhone"');
  expect(routeSource).not.toContain("Customer.id");
  expect(routeSource).not.toContain("Order.id");
});
