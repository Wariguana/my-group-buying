import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const boundary = vi.hoisted(() => ({ list: vi.fn(), customer: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/commerce/public", () => ({ listStorefront: boundary.list }));
vi.mock("@/lib/customer-auth/current-customer", () => ({ getCurrentCustomerAccount: boundary.customer }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import HomePage from "@/app/page";

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); localStorage.clear(); boundary.customer.mockResolvedValue(null); boundary.list.mockResolvedValue({ categories: [], cards: [], featured: [], extraFeatured: false }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const home = (query = {}) => HomePage({ searchParams: Promise.resolve(query), params: Promise.resolve({}) });

test("empty storefront has one cart entrance and a distinct compact no-groups state", async () => {
  render(await home());
  expect(screen.getAllByRole("link", { name: "購物車" })).toHaveLength(1);
  expect(screen.queryByRole("link", { name: "我的訂單" })).not.toBeInTheDocument();
  expect(screen.getByText("目前沒有開放中的團購")).toBeVisible();
  expect(screen.getByText("新的團購正在準備中。")).toBeVisible();
  expect(screen.queryByRole("link", { name: /清除|更多精選|查看已結束/ })).not.toBeInTheDocument();
  expect(screen.getByText("一起買，更簡單。")).toBeVisible();
  expect(screen.queryByText(/金額以新臺幣計價/)).not.toBeInTheDocument();
});

test("signed-in storefront keeps one order entrance and uses the existing display name", async () => {
  boundary.customer.mockResolvedValueOnce({ displayName: "測試顧客" });
  render(await home());
  expect(screen.getAllByRole("link", { name: "我的訂單" })).toHaveLength(1);
  expect(screen.getByLabelText("測試顧客，帳號選單")).toBeVisible();
  expect(screen.queryByRole("link", { name: "LINE 登入" })).not.toBeInTheDocument();
});

test("no search matches can clear only search while retaining category and legacy view", async () => {
  render(await home({ q: "不存在", category: "c1", view: "ended" }));
  expect(screen.getByText("找不到符合條件的團購")).toBeVisible();
  expect(screen.getByRole("link", { name: "清除搜尋" })).toHaveAttribute("href", "/?category=c1&view=ended");
  expect(screen.getByRole("heading", { name: "已結束團購" })).toBeVisible();
  expect(screen.queryByRole("navigation", { name: "商城導航" })).not.toBeInTheDocument();
});

test("one search, dynamic chips, actual prices and a real latest select retain the existing query", async () => {
  const card = { id: "g1", slug: "gb-test", title: "測試團購", image: null, category: "食品", minPrice: 99, priceVaries: true, startAt: new Date(0), endAt: new Date("2099-01-01"), soldOut: false };
  boundary.list.mockResolvedValueOnce({ categories: [{ id: "c1", name: "食品" }], cards: [card], featured: [card], extraFeatured: false });
  render(await home({ q: "測試", category: "c1" }));
  expect(boundary.list).toHaveBeenCalledWith({ q: "測試", category: "c1", view: undefined });
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("找團購");
  expect(screen.getByRole("heading", { name: "正在開團 · 食品" })).toBeVisible();
  expect(screen.queryByText("一起買，日常更簡單")).not.toBeInTheDocument();
  expect(screen.getAllByRole("search")).toHaveLength(1);
  expect(screen.getByPlaceholderText("搜尋商品、品牌或關鍵字")).toHaveValue("測試");
  expect(screen.getByText("1 個團購可加入")).toBeVisible();
  expect(screen.getByRole("combobox", { name: "排序" })).toHaveValue("latest");
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(within(screen.getByRole("region", { name: "商品列表" })).getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getByText(/NT\$99/)).toHaveTextContent("NT$99起");
  expect(screen.getByRole("link", { name: "食品" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "全部" })).toHaveAttribute("href", "/?q=%E6%B8%AC%E8%A9%A6");
  const link = screen.getByRole("link", { name: card.title });
  expect(link).toHaveAttribute("href", "/group-buys/gb-test");
  expect(link.querySelector("a,button")).toBeNull();
  expect(screen.queryByText("開放訂購中")).not.toBeInTheDocument();
  expect(link.querySelector("time")).toHaveAttribute("datetime", card.endAt.toISOString());
});

test("a category-only empty result can return to all without changing the legacy view", async () => {
  render(await home({ category: "c1", view: "featured" }));
  expect(screen.getByRole("link", { name: "回到全部" })).toHaveAttribute("href", "/?view=featured");
  expect(screen.getByRole("combobox", { name: "排序" })).toHaveValue("featured");
});

test("failed storefront offers reload without a misleading zero count", async () => {
  boundary.list.mockRejectedValueOnce(new Error("unavailable"));
  render(await home());
  expect(screen.getByRole("alert")).toHaveTextContent("無法載入團購");
  expect(screen.queryByText("0 個團購可加入")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "重新載入商城" })).toHaveAttribute("href", "/");
});
