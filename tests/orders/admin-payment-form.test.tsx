import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/app/admin/(protected)/orders/[publicCode]/payment-actions", () => ({ submitAdminPaymentOrderAction: vi.fn() }));
import { AdminPaymentOrderFormView } from "@/app/admin/(protected)/orders/[publicCode]/payment-form";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const props = { publicCode: "ord-AbCdEf0123_-xyZ9", totalAmount: 798, state: { status: "idle" as const }, pending: false, formAction: vi.fn() };

test("form includes only publicCode, irreversible warning and authoritative total", () => {
  render(<AdminPaymentOrderFormView {...props} />);
  expect(screen.getByText("收款後無法復原，且無法取消訂單。")).toBeVisible();
  expect(screen.getByText("請確認已收到訂單全額款項。")).toBeVisible();
  expect(screen.getByText("應收總額：$798")).toBeVisible();
  const form = screen.getByRole("button", { name: "確認已收款" }).closest("form")!;
  expect([...new FormData(form).entries()]).toEqual([["publicCode", props.publicCode]]);
});

test("declining irreversible confirmation prevents submission", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<AdminPaymentOrderFormView {...props} />);
  expect(fireEvent.submit(screen.getByRole("button").closest("form")!)).toBe(false);
  expect(confirm).toHaveBeenCalledWith("請確認已全額收款 $798。確認後無法復原，且無法取消訂單，確定要確認已收款嗎？");
  expect(props.formAction).not.toHaveBeenCalled();
});

test("pending disables repeat submissions and announces errors", () => {
  const confirm = vi.spyOn(window, "confirm");
  render(<AdminPaymentOrderFormView {...props} pending state={{ status: "error", message: "確認收款失敗" }} />);
  expect(screen.getByRole("button", { name: "收款處理中…" })).toBeDisabled();
  expect(screen.getByRole("button").closest("form")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("alert")).toHaveTextContent("確認收款失敗");
  expect(fireEvent.submit(screen.getByRole("button").closest("form")!)).toBe(false);
  expect(confirm).not.toHaveBeenCalled();
});

test("success announces completion and removes payment control", () => {
  render(<AdminPaymentOrderFormView {...props} state={{ status: "success", message: "訂單已確認收款。" }} />);
  expect(screen.getByRole("status")).toHaveTextContent("訂單已確認收款。");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
