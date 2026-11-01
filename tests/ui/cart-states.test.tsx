import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const verify = vi.hoisted(() => vi.fn());
vi.mock("@/app/cart/actions", () => ({ revalidateCartAction: verify }));
import { CartClient } from "@/app/cart/cart-client";
import { CART_KEY } from "@/lib/commerce/cart-storage";

beforeEach(() => { localStorage.clear(); verify.mockReset(); });
afterEach(cleanup);

test("empty cart waits for validation, then offers only continue shopping", async () => {
  let finish!: (value: unknown) => void;
  verify.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<CartClient />);
  expect(screen.getByRole("status")).toHaveTextContent("正在重新驗價");
  expect(screen.queryByText("購物車目前沒有商品。")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "重新驗價與庫存" })).not.toBeInTheDocument();
  await act(async () => finish({ ok: true, value: { items: [], total: 0 } }));
  expect(screen.getByText("購物車目前沒有商品。")).toBeVisible();
  expect(screen.getByRole("link", { name: "繼續購物" })).toHaveAttribute("href", "/");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByText(/請先確認購物車|LINE 登入/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("failed validation is an error, never a successful empty cart", async () => {
  verify.mockRejectedValue(new Error("private server error"));
  render(<CartClient />);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("無法驗證購物車"));
  expect(screen.queryByText("購物車目前沒有商品。")).not.toBeInTheDocument();
  expect(screen.queryByText("private server error")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "重新載入購物車" })).toBeEnabled());
});

test("stale successful validation cannot restore checkout after another tab clears the cart", async () => {
  const line = { offerId: "11111111-1111-4111-8111-111111111111", quantity: 1, expectedPrice: 299 };
  localStorage.setItem(CART_KEY, JSON.stringify([line]));
  let finish!: (value: unknown) => void;
  verify.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ ok: true, value: { items: [], total: 0 } });
  render(<CartClient />);
  localStorage.removeItem(CART_KEY);
  fireEvent(window, new StorageEvent("storage", { key: CART_KEY }));
  await act(async () => finish({ ok: true, value: { items: [{ ...line, status: null }], total: 299 } }));
  await waitFor(() => expect(screen.getByText("購物車目前沒有商品。")).toBeVisible());
  expect(screen.queryByRole("link", { name: "前往跨團結帳" })).not.toBeInTheDocument();
});
