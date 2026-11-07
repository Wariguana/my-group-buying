import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { StorefrontHeader } from "@/app/storefront-header";
import { CART_KEY, saveCart, removeAcknowledgedCartLines } from "@/lib/commerce/cart-storage";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

test("account menu preserves POST logout, closes on Escape and outside pointer", () => {
  render(<StorefrontHeader account={{ displayName: "驗收顧客" }} />);
  const summary = screen.getByLabelText("驗收顧客，帳號選單");
  expect(screen.getByRole("link", { name: "我的訂單" })).toHaveAttribute("href", "/my/orders");
  expect(screen.getByText("登出", { exact: true })).not.toBeVisible();
  fireEvent.click(summary);
  const logout = screen.getByRole("button", { name: "登出" });
  expect(logout.closest("form")).toHaveAttribute("method", "post");
  expect(logout.closest("form")).toHaveAttribute("action", "/api/auth/line/logout");
  fireEvent.keyDown(summary, { key: "Escape" });
  expect(summary.closest("details")).not.toHaveAttribute("open");
  expect(summary).toHaveFocus();
  fireEvent.click(summary);
  fireEvent.pointerDown(document.body);
  expect(summary.closest("details")).not.toHaveAttribute("open");
});

test("badge reads existing cart quantities and recovers on storage events without changing cart", () => {
  const lines = [{ offerId: "11111111-1111-4111-8111-111111111111", quantity: 2, expectedPrice: 199 }, { offerId: "22222222-2222-4222-8222-222222222222", quantity: 1, expectedPrice: 299 }];
  const stored = JSON.stringify(lines);
  localStorage.setItem(CART_KEY, stored);
  render(<StorefrontHeader account={null} />);
  const cart = screen.getByRole("link", { name: "購物車" });
  expect(within(cart).getByText("3")).toBeInTheDocument();
  expect(localStorage.getItem(CART_KEY)).toBe(stored);
  localStorage.setItem(CART_KEY, "invalid");
  fireEvent(window, new StorageEvent("storage", { key: CART_KEY }));
  expect(within(cart).queryByText("3")).not.toBeInTheDocument();
  expect(cart).toHaveAttribute("href", "/cart");
  expect(localStorage.getItem(CART_KEY)).toBe("invalid");
});

test("missing name and unavailable existing avatar have a safe account fallback", () => {
  const { container } = render(<StorefrontHeader account={{ displayName: null, pictureUrl: "/avatar-not-available.png" }} />);
  expect(screen.getByLabelText("帳號，帳號選單")).toBeVisible();
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")).toBeNull();
  expect(screen.queryByRole("link", { name: "我的帳號" })).not.toBeInTheDocument();
});

test("guest has a real LINE login link and no made-up identity or zero badge", () => {
  render(<StorefrontHeader account={null} />);
  expect(screen.getByRole("link", { name: "LINE 登入" })).toHaveAttribute("href", "/api/auth/line/start");
  expect(screen.queryByRole("link", { name: "我的訂單" })).not.toBeInTheDocument();
  expect(screen.queryByText("0")).not.toBeInTheDocument();
});


test("badge updates immediately for same-document add, quantity edit, removal and checkout cleanup", () => {
  const a = { offerId: "11111111-1111-4111-8111-111111111111", quantity: 1, expectedPrice: 199 };
  const b = { offerId: "22222222-2222-4222-8222-222222222222", quantity: 2, expectedPrice: 299 };
  const { container } = render(<StorefrontHeader account={null} />);
  const badge = () => container.querySelector(".qbuy-cart-count");
  expect(badge()).toBeNull();
  act(() => saveCart(localStorage, [a, b]));
  expect(badge()).toHaveTextContent("3");
  act(() => saveCart(localStorage, [{ ...a, quantity: 4 }, b]));
  expect(badge()).toHaveTextContent("6");
  act(() => saveCart(localStorage, [b]));
  expect(badge()).toHaveTextContent("2");
  act(() => removeAcknowledgedCartLines(localStorage, [b]));
  expect(badge()).toBeNull();
});
