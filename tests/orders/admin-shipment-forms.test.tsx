import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
vi.mock("@/app/admin/(protected)/orders/[publicCode]/shipment-actions", () => ({
  submitAdminCreateShipmentAction: vi.fn(), submitAdminShipShipmentAction: vi.fn(), submitAdminArriveShipmentAction: vi.fn(),
  submitAdminReturnShipmentAction: vi.fn(), submitAdminVoidShipmentAction: vi.fn(),
}));
import { AdminCreateShipmentFormView, AdminShipmentTransitionFormView } from "@/app/admin/(protected)/orders/[publicCode]/shipment-forms";
const props = { state: { status: "idle" as const }, pending: false, formAction: vi.fn() };
const publicCode = "ord-AbCdEf0123_-xyZ9";
const shipmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
afterEach(() => { cleanup(); vi.restoreAllMocks(); props.formAction.mockClear(); });
test("accessible create form contains only tracking and code, manual external workflow, no confirmation", () => {
  const confirm = vi.spyOn(window, "confirm");
  render(<AdminCreateShipmentFormView {...props} publicCode={publicCode} />);
  const input = screen.getByRole("textbox", { name: "物流編號" });
  expect(input).toBeRequired(); expect(input).toHaveAttribute("maxlength", "128"); expect(input).toHaveAttribute("type", "text");
  fireEvent.change(input, { target: { value: "tracking" } });
  const form = input.closest("form")!;
  expect([...new FormData(form).entries()]).toEqual([["publicCode", publicCode], ["trackingNumber", "tracking"]]);
  expect(screen.getByText(/請先在 7-ELEVEN MyShip／交貨便建立取貨付款寄件/)).toBeVisible();
  fireEvent.submit(form);
  expect(confirm).not.toHaveBeenCalled();
  expect(props.formAction).toHaveBeenCalled();
});
test("pending create disables input and prevents duplicate submission with accessible error", () => {
  render(<AdminCreateShipmentFormView {...props} publicCode={publicCode} pending state={{ status: "error", message: "失敗" }} />);
  expect(screen.getByRole("textbox")).toBeDisabled();
  expect(screen.getByRole("button", { name: "登錄中…" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("失敗");
  const form = screen.getByRole("button").closest("form")!;
  expect(form).toHaveAttribute("aria-busy", "true");
  expect(fireEvent.submit(form)).toBe(false); expect(props.formAction).not.toHaveBeenCalled();
});
test("create committed success removes editable form", () => {
  render(<AdminCreateShipmentFormView {...props} publicCode={publicCode} state={{ status: "success", message: "完成" }} />);
  expect(screen.getByRole("status")).toHaveTextContent("完成");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
for (const [operation, label, confirmation] of [
  ["SHIP", "標記已寄出", "請確認包裹已實際交寄，確定要標記已寄出嗎？"],
  ["ARRIVE", "標記已到店", "請確認已核實包裹實際到店，確定要標記已到店嗎？"],
  ["RETURN", "標記已退回", "確認包裹已退回？此操作只記錄退回，不會自動回補訂單庫存。"],
  ["VOID", "作廢物流", "請先在外部 MyShip 作廢物流。本系統不會代為作廢。確認外部作廢已完成，要記錄作廢嗎？"],
] as const) {
  test(`${operation}: exact confirmation, decline prevents submission, only ID forwarded on accept`, () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AdminShipmentTransitionFormView {...props} shipmentId={shipmentId} operation={operation} />);
    const form = screen.getByRole("button", { name: label }).closest("form")!;
    expect([...new FormData(form).entries()]).toEqual([["shipmentId", shipmentId]]);
    expect(fireEvent.submit(form)).toBe(false); expect(confirm).toHaveBeenCalledWith(confirmation);
    expect(props.formAction).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.submit(form); expect(props.formAction).toHaveBeenCalled();
  });
  test(`${operation}: pending prevents repeat confirmations and success removes mutation`, () => {
    const confirm = vi.spyOn(window, "confirm");
    const view = render(<AdminShipmentTransitionFormView {...props} shipmentId={shipmentId} operation={operation} pending state={{ status: "error", message: "失敗" }} />);
    expect(screen.getByRole("button", { name: "物流處理中…" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("失敗");
    expect(fireEvent.submit(screen.getByRole("button").closest("form")!)).toBe(false);
    expect(confirm).not.toHaveBeenCalled(); expect(props.formAction).not.toHaveBeenCalled();
    view.rerender(<AdminShipmentTransitionFormView {...props} shipmentId={shipmentId} operation={operation} state={{ status: "success", message: "完成" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("完成"); expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
}
