// @vitest-environment node

import { createHash } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  groupBuyFindFirst: vi.fn(),
  selectionCreate: vi.fn(),
  selectionFindFirst: vi.fn(),
  selectionUpdateMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => ({
  groupBuy: { findFirst: boundary.groupBuyFindFirst },
  sevenElevenStoreSelection: {
    create: boundary.selectionCreate,
    findFirst: boundary.selectionFindFirst,
    updateMany: boundary.selectionUpdateMany,
  },
}) }));

import { beginSevenElevenStoreSelection, completeSevenElevenStoreSelection } from "@/lib/logistics/store-selection";

const now = new Date("2026-09-16T01:00:00.000Z");
const browserBinding = "A".repeat(43);
const callback = {
  MerchantID: "2000933",
  MerchantTradeNo: "abcdefghijklmnopqrst",
  LogisticsSubType: "UNIMARTC2C" as const,
  CVSStoreID: "123456",
  CVSStoreName: "偽造名稱",
  CVSAddress: "偽造地址",
  ExtraData: "ABCDEFGHIJKLMNOPQRST",
};

beforeEach(() => {
  vi.resetAllMocks();
  boundary.groupBuyFindFirst.mockResolvedValue({ id: "group-buy-id" });
  boundary.selectionCreate.mockResolvedValue({ id: "selection-id" });
  boundary.selectionFindFirst.mockResolvedValue({
    id: "selection-id",
    groupBuy: { slug: "gb-AbCdEf0123_-xyZ9", allowsSevenEleven: true },
  });
  boundary.selectionUpdateMany.mockResolvedValue({ count: 1 });
});

test("begin creates an unguessable, expiring state only for an orderable enabled Group Buy", async () => {
  const result = await beginSevenElevenStoreSelection("gb-AbCdEf0123_-xyZ9", browserBinding, now);
  expect(result.state).toMatch(/^[A-Za-z0-9_-]{20}$/);
  expect(boundary.groupBuyFindFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ allowsSevenEleven: true, status: "PUBLISHED" }),
  }));
  expect(boundary.selectionCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      browserBindingHash: createHash("sha256").update(browserBinding).digest("base64url"),
      expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
    }),
  }));
});

test("concurrent selections in one browser retain the same pre-established binding", async () => {
  await beginSevenElevenStoreSelection("gb-AbCdEf0123_-xyZ9", browserBinding, now);
  await beginSevenElevenStoreSelection("gb-AbCdEf0123_-xyZ9", browserBinding, now);
  const expectedHash = createHash("sha256").update(browserBinding).digest("base64url");
  expect(boundary.selectionCreate).toHaveBeenCalledTimes(2);
  expect(boundary.selectionCreate.mock.calls.map(([request]) => request.data.browserBindingHash))
    .toEqual([expectedHash, expectedHash]);
});

test("callback ignores forged browser name/address and persists canonical provider data", async () => {
  const resolveStore = vi.fn().mockResolvedValue({ id: "123456", name: "權威門市", address: "臺北市權威路 1 號" });
  const result = await completeSevenElevenStoreSelection(callback, { now, merchantId: "2000933", resolveStore });
  expect(result).toMatchObject({ slug: "gb-AbCdEf0123_-xyZ9" });
  expect(result).not.toHaveProperty("browserBinding");
  expect(resolveStore).toHaveBeenCalledExactlyOnceWith("123456");
  expect(boundary.selectionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    storeId: "123456", storeName: "權威門市", storeAddress: "臺北市權威路 1 號",
  }) }));
  expect(boundary.selectionUpdateMany.mock.calls[0][0].data).not.toHaveProperty("browserBindingHash");
  expect(JSON.stringify(boundary.selectionUpdateMany.mock.calls)).not.toContain("偽造");
});

test.each([
  ["invalid state", { ...callback, ExtraData: "bad" }, true],
  ["wrong merchant", { ...callback, MerchantID: "9999999" }, true],
  ["expired or reused state", callback, false],
] as const)("%s fails safely", async (_label, payload, hasPending) => {
  if (!hasPending) boundary.selectionFindFirst.mockResolvedValue(null);
  await expect(completeSevenElevenStoreSelection(payload, {
    now,
    merchantId: "2000933",
    resolveStore: vi.fn().mockResolvedValue({ id: "123456", name: "權威門市", address: "權威地址" }),
  })).resolves.toBeNull();
  expect(boundary.selectionUpdateMany).not.toHaveBeenCalled();
});

test("a callback state can become ready only once", async () => {
  boundary.selectionUpdateMany.mockResolvedValue({ count: 0 });
  await expect(completeSevenElevenStoreSelection(callback, {
    now,
    merchantId: "2000933",
    resolveStore: vi.fn().mockResolvedValue({ id: "123456", name: "權威門市", address: "權威地址" }),
  })).resolves.toBeNull();
});
