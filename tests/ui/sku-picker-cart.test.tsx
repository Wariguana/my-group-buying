import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const verify = vi.hoisted(() => vi.fn());
vi.mock("@/app/cart/actions", () => ({ revalidateCartAction: verify }));
import { SkuPicker } from "@/app/group-buys/[slug]/sku-picker";
import { StorefrontHeader } from "@/app/storefront-header";
import { CART_KEY, loadCart } from "@/lib/commerce/cart-storage";

const a = { offerId: "11111111-1111-4111-8111-111111111111", quantity: 1, expectedPrice: 299 };
const b = { offerId: "22222222-2222-4222-8222-222222222222", quantity: 2, expectedPrice: 199 };
const offer = { id: a.offerId, label: "Test SKU", salePrice: 299, purchaseLimit: null, available: 99, status: null, temperature: "AMBIENT", shippingMethods: [], shippingNote: null };
const valid = { ok: true, value: { items: [{ ...a, status: null }], total: 299 } };
beforeEach(() => { localStorage.clear(); verify.mockReset(); });
afterEach(cleanup);

test.each([{ current: [b] }, { current: [{ ...a, quantity: 5 }] }, { current: [] }])("pending add preserves another tab's cart update %j and can be retried", async ({ current }) => {
  localStorage.setItem(CART_KEY, JSON.stringify([a]));
  let finish!: (value: unknown) => void;
  verify.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(valid);
  render(<SkuPicker offers={[offer]} />);
  fireEvent.click(screen.getByRole("button"));
  expect(verify).toHaveBeenCalledWith([{ ...a, quantity: 2 }]);
  localStorage.setItem(CART_KEY, JSON.stringify(current));
  await act(async () => finish(valid));
  expect(loadCart(localStorage)).toEqual(current);
  expect(screen.getByRole("alert")).toHaveTextContent("購物車已在其他頁面更新");
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(loadCart(localStorage)).toEqual([...current.filter(line => line.offerId !== a.offerId), { ...a, quantity: 1 + (current.find(line => line.offerId === a.offerId)?.quantity ?? 0) }]);
});

test("successful add updates the mounted header without a storage or focus event", async () => {
  verify.mockResolvedValue(valid);
  const { container } = render(<><StorefrontHeader account={null} /><SkuPicker offers={[offer]} /></>);
  fireEvent.click(screen.getByRole("button", { name: "加入購物車" }));
  await waitFor(() => expect(container.querySelector(".qbuy-cart-count")).toHaveTextContent("1"));
});
