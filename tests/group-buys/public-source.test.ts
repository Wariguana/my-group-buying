// @vitest-environment node

import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("public routes stay unauthenticated and request-time rendered with a narrow form boundary", async () => {
  const [listPage, detailPage] = await Promise.all([
    source("src/app/page.tsx"),
    source("src/app/group-buys/[slug]/page.tsx"),
  ]);
  const routes = `${listPage}\n${detailPage}`;

  expect(routes).not.toContain("requireAdmin");
  expect(routes).not.toContain('"use server"');
  expect(detailPage).not.toContain("createOrder");
  expect(detailPage).toContain("PublicOrderForm");
  expect(detailPage).toContain("key={item.id}");
  expect(detailPage).toContain("key={pickup.id}");
  expect(listPage).toContain('dynamic = "force-dynamic"');
  expect(detailPage).toContain('dynamic = "force-dynamic"');
  expect(detailPage).toContain("notFound()");
});

test("public source contains safe empty displays and exact stock and purchase-limit semantics", async () => {
  const [listPage, detailPage] = await Promise.all([
    source("src/app/page.tsx"),
    source("src/app/group-buys/[slug]/page.tsx"),
  ]);

  expect(listPage).toContain("目前沒有可查看的團購。");
  for (const text of [
    "目前沒有可供訂購的商品。",
    "目前沒有可用的取貨地點。",
    "不限量",
    "已無庫存",
    "剩餘 ${stock}",
    "不限購",
    "每人限購 ${purchaseLimit}",
    "取貨時間另行通知",
  ]) {
    expect(detailPage).toContain(text);
  }
});

test("public query source cannot make DRAFT or CANCELLED records public or expose cost and supplier fields", async () => {
  const service = await source("src/lib/group-buys/public-service.ts");
  expect(service).toContain('status: "PUBLISHED"');
  expect(service).not.toContain('status: "DRAFT"');
  expect(service).not.toContain('status: "CANCELLED"');
  expect(service).not.toMatch(/\bcost\s*:/);
  expect(service).not.toMatch(/\bsupplier\s*:/);
});

test("public order action delegates to createOrder without direct database access", async () => {
  const action = await source("src/app/group-buys/[slug]/actions.ts");
  expect(action).toContain('"use server"');
  expect(action).toContain("createOrder(parsed.slug, parsed.input)");
  expect(action).not.toMatch(/\bgetDb\b|\bPrisma\b/);
});
