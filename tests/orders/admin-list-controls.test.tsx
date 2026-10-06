import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({ push: vi.fn(), pending: false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: boundary.push }) }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useTransition: () => [boundary.pending, (callback: () => void) => callback()],
}));

import { AdminOrderListControls } from "@/app/admin/(protected)/orders/list-controls";

const publicCode = "ord-AbCdEf0123_-xyZ9";
const orderNumber = "202610020001";
beforeEach(() => { vi.clearAllMocks(); boundary.pending = false; });
afterEach(cleanup);

test.each([
  ["SHIPMENT_TO_CREATE", "待建立物流"], ["SHIPMENT_CREATED", "待寄出"], ["SHIPMENT_SHIPPED", "運送中"],
  ["SHIPMENT_ARRIVED", "已到店待取"], ["SHIPMENT_RETURNED", "退回待處理"],
] as const)("%s shortcut clears contradictions/cursors, retains exact search, and allows legal filters", (queue, label) => {
  const view = render(<AdminOrderListControls input={{ orderNumber, status: "CANCELLED", fulfillment: "SELF_PICKUP",
    navigation: { direction: "OLDER", anchorPublicCode: publicCode } }} />);
  expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", `/admin/orders?orderNumber=${orderNumber}&queue=${queue}`);
  view.unmount();
  render(<AdminOrderListControls input={{ orderNumber, queue, status: "PLACED", fulfillment: "SEVEN_ELEVEN" }} />);
  expect(screen.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
  fireEvent.submit(screen.getByRole("form", { name: "搜尋及篩選訂單" }));
  expect(boundary.push).toHaveBeenCalledExactlyOnceWith(`/admin/orders?orderNumber=${orderNumber}&status=PLACED&fulfillment=SEVEN_ELEVEN&queue=${queue}`);
  boundary.push.mockClear();
  fireEvent.change(screen.getByRole("combobox", { name: "取貨方式" }), { target: { value: "SELF_PICKUP" } });
  fireEvent.submit(screen.getByRole("form", { name: "搜尋及篩選訂單" }));
  expect(boundary.push).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("不相容");
});

test("new exact search retains valid filters and queue but drops the cursor", () => {
  render(<AdminOrderListControls input={{ status: "PLACED", fulfillment: "SELF_PICKUP", queue: "UNPAID", navigation: { direction: "OLDER", anchorPublicCode: publicCode } }} />);
  fireEvent.change(screen.getByRole("textbox", { name: "完整訂單編號" }), { target: { value: orderNumber } });
  fireEvent.submit(screen.getByRole("form", { name: "搜尋及篩選訂單" }));
  expect(boundary.push).toHaveBeenCalledExactlyOnceWith(`/admin/orders?orderNumber=${orderNumber}&status=PLACED&fulfillment=SELF_PICKUP&queue=UNPAID`);
});

test("blank search and all filters produce the canonical root URL", () => {
  render(<AdminOrderListControls input={{ orderNumber, status: "PLACED", fulfillment: "SELF_PICKUP", navigation: { direction: "NEWER", anchorPublicCode: publicCode } }} />);
  fireEvent.change(screen.getByRole("textbox", { name: "完整訂單編號" }), { target: { value: "" } });
  fireEvent.change(screen.getByRole("combobox", { name: "訂單狀態" }), { target: { value: "" } });
  fireEvent.change(screen.getByRole("combobox", { name: "取貨方式" }), { target: { value: "" } });
  fireEvent.submit(screen.getByRole("form", { name: "搜尋及篩選訂單" }));
  expect(boundary.push).toHaveBeenCalledExactlyOnceWith("/admin/orders");
});

test.each([
  ["UNPAID", "訂單狀態", "CANCELLED"],
  ["SELF_PICKUP_PENDING", "訂單狀態", "CANCELLED"],
  ["SELF_PICKUP_PENDING", "取貨方式", "SEVEN_ELEVEN"],
] as const)("changing a filter incompatible with %s fails closed without discarding the queue", (queue, label, value) => {
  render(<AdminOrderListControls input={{ status: "PLACED", fulfillment: "SELF_PICKUP", queue, navigation: { direction: "OLDER", anchorPublicCode: publicCode } }} />);
  fireEvent.change(screen.getByRole("combobox", { name: label }), { target: { value } });
  fireEvent.submit(screen.getByRole("form", { name: "搜尋及篩選訂單" }));
  expect(boundary.push).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("目前作業佇列與篩選條件不相容，請先選擇全部或清除條件。");
});

test.each(["0912345678", "PRIVATE_NAME", "20261002", "1".repeat(13)])("malformed search is never sent to a URL: %s", (value) => {
  render(<AdminOrderListControls input={{}} />);
  const input = screen.getByRole("textbox", { name: "完整訂單編號" });
  expect(input).toHaveAttribute("pattern", "[0-9]{12}");
  expect(input).toHaveAttribute("maxlength", "12");
  fireEvent.change(input, { target: { value } });
  fireEvent.submit(screen.getByRole("form", { name: "搜尋及篩選訂單" }));
  expect(boundary.push).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("請輸入完整的 12 位訂單編號");
});

test("navigation pending shows loading and disables repeated form submissions", () => {
  boundary.pending = true;
  render(<AdminOrderListControls input={{ orderNumber }} />);
  expect(screen.getByRole("form", { name: "搜尋及篩選訂單" })).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("button", { name: "搜尋中…" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "完整訂單編號" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "訂單狀態" })).toBeDisabled();
  fireEvent.submit(screen.getByRole("form", { name: "搜尋及篩選訂單" }));
  expect(boundary.push).not.toHaveBeenCalled();
});
