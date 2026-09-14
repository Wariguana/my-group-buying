import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/app/group-buys/[slug]/actions", () => ({
  submitPublicOrderAction: vi.fn(),
}));

import { PublicOrderFormView } from "@/app/group-buys/[slug]/order-form";

afterEach(cleanup);

const itemA = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  salePrice: 120,
  stock: 5,
  purchaseLimit: 3,
  product: { name: "蘋果", unit: "箱" },
};
const pickup = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  pickupStartAt: null,
  pickupEndAt: null,
  pickupLocation: { name: "中正取貨點", address: "台北市中正區" },
};

function renderView(overrides: Partial<Parameters<typeof PublicOrderFormView>[0]> = {}) {
  return render(<PublicOrderFormView
    slug="gb-AbCdEf0123_-xyZ9"
    items={[itemA]}
    pickups={[pickup]}
    state={{ status: "idle" }}
    pending={false}
    formAction={vi.fn()}
    {...overrides}
  />);
}

test("renders accessible customer, pickup, quantity, and submit controls", () => {
  renderView();
  expect(screen.getByLabelText("訂購人姓名")).toBeRequired();
  expect(screen.getByLabelText("手機號碼")).toBeRequired();
  expect(screen.getByRole("radio", { name: /中正取貨點/ })).toBeChecked();
  expect(screen.getByLabelText("蘋果數量")).toHaveAttribute("max", "3");
  expect(screen.getByRole("button", { name: "送出訂單" })).toBeEnabled();
});

test("disables stock-zero and purchaseLimit-zero items with clear explanations", () => {
  renderView({ items: [
    { ...itemA, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", stock: 0 },
    { ...itemA, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", stock: null, purchaseLimit: 0, product: { name: "橘子", unit: "袋" } },
  ] });
  expect(screen.getByLabelText("蘋果數量")).toBeDisabled();
  expect(screen.getByText("已無庫存")).toBeVisible();
  expect(screen.getByLabelText("橘子數量")).toBeDisabled();
  expect(screen.getByText("目前不可購買")).toBeVisible();
});

test("renders public-safe errors as an alert", () => {
  renderView({ state: { status: "error", message: "商品庫存不足，請重新整理後調整數量。" } });
  expect(screen.getByRole("alert")).toHaveTextContent("商品庫存不足");
});

test("success replaces the form with an assistive confirmation and reference-only details", () => {
  renderView({ state: {
    status: "success",
    publicCode: "ord-AbCdEf0123_-xyZ9",
    totalAmount: 240,
    managementCode: "A".repeat(43),
  } });
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("訂購成功");
  expect(status).toHaveTextContent("ord-AbCdEf0123_-xyZ9");
  expect(status).toHaveTextContent("240");
  expect(status).toHaveTextContent("訂單管理碼");
  expect(status).toHaveTextContent("等同訂單管理密碼");
  expect(status).toHaveTextContent("不能作為管理憑證");
  expect(screen.getByRole("link", { name: "查看訂單" })).toHaveAttribute(
    "href",
    "/orders/ord-AbCdEf0123_-xyZ9",
  );
  expect(screen.queryByRole("button", { name: "送出訂單" })).not.toBeInTheDocument();
});

test("pending disables the fieldset and submit button to prevent duplicate submissions", () => {
  renderView({ pending: true });
  expect(screen.getByRole("button", { name: "訂單送出中…" })).toBeDisabled();
  expect(screen.getByLabelText("訂購人姓名")).toBeDisabled();
  expect(screen.getByLabelText("蘋果數量")).toBeDisabled();
});
