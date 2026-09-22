// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  getDb: () => ({ order: { findMany: boundary.findMany } }),
}));

import { listMyOrders } from "@/lib/orders/my-orders-service";

const accountA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => {
  vi.resetAllMocks();
  boundary.findMany.mockResolvedValue([]);
});

test("queries only the exact authenticated owner newest first", async () => {
  await listMyOrders(accountA);
  expect(boundary.findMany).toHaveBeenCalledWith({
    where: { customerAccountId: accountA },
    select: expect.objectContaining({
      publicCode: true,
      orderNumber: true,
      groupBuy: { select: { title: true } },
    }),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
});

test.each([null, undefined, "bad", "+886912345678"])(
  "invalid or phone-shaped identity %s cannot query orders",
  async (identity) => {
    await expect(listMyOrders(identity)).resolves.toEqual([]);
    expect(boundary.findMany).not.toHaveBeenCalled();
  },
);

test("service returns database ordering without phone or guest fallback", async () => {
  const newest = { publicCode: "ord-new" };
  const oldest = { publicCode: "ord-old" };
  boundary.findMany.mockResolvedValue([newest, oldest]);
  await expect(listMyOrders(accountA)).resolves.toEqual([newest, oldest]);
  expect(JSON.stringify(boundary.findMany.mock.calls[0][0].where)).not.toMatch(/phone|customerId|null/i);
});
