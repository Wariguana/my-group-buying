import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const boundary = vi.hoisted(() => ({ list: vi.fn(), customer: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/commerce/public", () => ({ listStorefront: boundary.list }));
vi.mock("@/lib/customer-auth/current-customer", () => ({ getCurrentCustomerAccount: boundary.customer }));
import HomePage from "@/app/page";

beforeEach(() => { boundary.customer.mockResolvedValue(null); boundary.list.mockResolvedValue({ categories: [], cards: [], featured: [], extraFeatured: false }); });
afterEach(cleanup);
const home = (query = {}) => HomePage({ searchParams: Promise.resolve(query), params: Promise.resolve({}) });

test("empty storefront has one cart entrance, no empty featured section or meaningless clear action", async () => {
  render(await home());
  expect(screen.getAllByRole("link", { name: "購物車" })).toHaveLength(1);
  expect(screen.queryByRole("link", { name: "我的訂單" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "精選開團" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "清除篩選條件" })).not.toBeInTheDocument();
  expect(screen.getByText("新團購準備中，歡迎稍後回來逛逛。")).toBeVisible();
});

test("signed-in storefront keeps exactly one order entrance in the header", async () => {
  boundary.customer.mockResolvedValueOnce({ displayName: "測試顧客" });
  render(await home());
  expect(screen.getAllByRole("link", { name: "我的訂單" })).toHaveLength(1);
  expect(screen.queryByRole("link", { name: "LINE 登入" })).not.toBeInTheDocument();
});

test("no search matches retains filter recovery and current view", async () => {
  render(await home({ q: "不存在", category: "c1", view: "ended" }));
  expect(screen.getByRole("link", { name: "清除篩選條件" })).toHaveAttribute("href", "/");
  expect(within(screen.getByRole("navigation", { name: "商城導航" })).getByRole("link", { name: "已結束" })).toHaveAttribute("aria-current", "page");
});
