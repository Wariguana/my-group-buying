import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  currentCustomer: vi.fn(),
  listMyOrders: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/customer-auth/current-customer", () => ({
  getCurrentCustomerAccount: boundary.currentCustomer,
}));
vi.mock("@/lib/orders/my-orders-service", () => ({
  listMyOrders: boundary.listMyOrders,
}));
vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));

import MyOrdersPage from "@/app/my/orders/page";

const account = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  lineUserId: "line-a",
  displayName: "王小明",
  pictureUrl: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  boundary.currentCustomer.mockResolvedValue(account);
  boundary.listMyOrders.mockResolvedValue([]);
  boundary.redirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

afterEach(cleanup);

test("unauthenticated visitor is redirected before any order query", async () => {
  boundary.currentCustomer.mockResolvedValue(null);
  await expect(MyOrdersPage()).rejects.toThrow("NEXT_REDIRECT:/");
  expect(boundary.listMyOrders).not.toHaveBeenCalled();
});

test("empty owner list has an explicit historical-guest-safe empty state", async () => {
  render(await MyOrdersPage());
  expect(boundary.listMyOrders).toHaveBeenCalledExactlyOnceWith(account.id);
  expect(screen.getByRole("heading", { name: "目前沒有訂單" })).toBeVisible();
  expect(screen.getByText(/過去的訪客訂單不會自動加入/)).toBeVisible();
});

test("renders owner summaries with detail links and pickup information", async () => {
  boundary.listMyOrders.mockResolvedValue([
    {
      publicCode: "ord-AbCdEf0123_-xyZ9",
      orderNumber: "202609220002",
      status: "PLACED",
      fulfillmentMethod: "SELF_PICKUP",
      pickupName: "中正取貨點",
      pickupAddress: "台北市中正區",
      sevenElevenStoreId: null,
      sevenElevenStoreName: null,
      sevenElevenStoreAddress: null,
      totalAmount: 300,
      createdAt: new Date("2026-09-22T01:00:00Z"),
      groupBuy: { title: "秋季水果團" },
    },
  ]);
  render(await MyOrdersPage());
  expect(screen.getByText("202609220002")).toBeVisible();
  expect(screen.getByText("秋季水果團")).toBeVisible();
  expect(screen.getByText(/中正取貨點/)).toBeVisible();
  expect(screen.getByRole("link", { name: /202609220002/ })).toHaveAttribute(
    "href",
    "/orders/ord-AbCdEf0123_-xyZ9",
  );
});
