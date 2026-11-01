import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { revalidateCartAction } from "@/app/cart/actions";
const boundary = vi.hoisted(() => ({ revalidate: vi.fn(), push: vi.fn() }));
vi.mock("@/app/cart/actions", () => ({ revalidateCartAction: boundary.revalidate }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: boundary.push }) }));
import { CheckoutForm } from "@/app/checkout/form";

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.resetAllMocks(); });
afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); });
test("typing while cart validation is pending cannot hide the store picker", async () => {
  const offerId = "aacc81cb-17a0-4034-a346-98ffb01fdc7c";
  localStorage.setItem("qbuy.cart.v1", JSON.stringify([{ offerId, quantity: 1, expectedPrice: 299 }]));
  let complete!: (value: Awaited<ReturnType<typeof revalidateCartAction>>) => void;
  boundary.revalidate.mockReturnValue(new Promise(resolve => { complete = resolve; }));
  render(<CheckoutForm methods={["SEVEN_ELEVEN"]} stores={[]} customerAccountId="current-customer"/>);
  fireEvent.change(screen.getByLabelText("收件人姓名", { exact: true }), { target: { value: "快速填寫顧客" } });
  fireEvent.change(screen.getByLabelText("手機", { exact: true }), { target: { value: "0912345678" } });
  await act(async () => complete({ ok: true, value: { total: 299, items: [{ offerId, slug: "gb-AbCdEf0123_-xyZ9" }] } } as Awaited<ReturnType<typeof revalidateCartAction>>));
  await waitFor(() => expect(screen.getByRole("button", { name: "選擇 7-ELEVEN 門市" })).toBeEnabled());
  expect(screen.getByLabelText("收件人姓名", { exact: true })).toHaveValue("快速填寫顧客");
  expect(screen.getByRole("button", { name: "計算配送與總額" })).toBeDisabled();
});

test("store-return draft cannot restore another account's recipient data", async () => {
  window.history.replaceState({}, "", "/checkout?selectionToken=fixture");
  sessionStorage.setItem("qbuy-checkout-store-draft:other-customer", JSON.stringify({ customerName: "其他帳號收件人", customerPhone: "0912345678", address: "其他帳號地址" }));
  boundary.revalidate.mockResolvedValue({ ok: true, value: { items: [], total: 0 } });
  render(<CheckoutForm methods={["SEVEN_ELEVEN"]} stores={[]} customerAccountId="current-customer"/>);
  await waitFor(() => expect(boundary.revalidate).toHaveBeenCalled());
  expect(screen.getByLabelText("收件人姓名", { exact: true })).toHaveValue("");
  expect(screen.getByLabelText("手機", { exact: true })).toHaveValue("");
  expect(sessionStorage.getItem("qbuy-checkout-request:current-customer")).toBeTruthy();
});

test("cross-tab cart updates preserve the recipient's current edits after a map return", async () => {
  window.history.replaceState({}, "", "/checkout?selectionToken=fixture");
  sessionStorage.setItem("qbuy-checkout-store-draft:current-customer", JSON.stringify({ customerName: "選店前姓名", customerPhone: "0912345678", address: "" }));
  boundary.revalidate.mockResolvedValue({ ok: true, value: { items: [], total: 0 } });
  render(<CheckoutForm methods={["SEVEN_ELEVEN"]} stores={[]} customerAccountId="current-customer"/>);
  const name = screen.getByLabelText("收件人姓名", { exact: true });
  expect(name).toHaveValue("選店前姓名");
  fireEvent.change(name, { target: { value: "選店後修改姓名" } });
  await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: "qbuy.cart.v1" })));
  expect(name).toHaveValue("選店後修改姓名");
});
