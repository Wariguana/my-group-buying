import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/app/orders/[publicCode]/cancel-actions", () => ({
  submitCancelOrderAction: vi.fn(),
}));

import { CancelOrderFormView } from "@/app/orders/[publicCode]/cancel-form";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const props = {
  publicCode: "ord-AbCdEf0123_-xyZ9",
  state: { status: "idle" as const },
  pending: false,
  formAction: vi.fn(),
};

test("renders irreversible warning and explicit publicCode only", () => {
  render(<CancelOrderFormView {...props} />);
  expect(screen.getByText("取消後無法復原。")).toBeVisible();
  expect(screen.getByRole("button", { name: "取消訂單" })).toBeEnabled();
  expect(document.querySelector('input[name="publicCode"]')).toHaveValue(props.publicCode);
  expect(document.querySelector('input[name="managementCode"]')).not.toBeInTheDocument();
});

test("requires destructive confirmation and can prevent submission", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<CancelOrderFormView {...props} />);
  fireEvent.submit(screen.getByRole("button", { name: "取消訂單" }).closest("form")!);
  expect(confirm).toHaveBeenCalledWith("取消後無法復原，確定要取消訂單嗎？");
  expect(props.formAction).not.toHaveBeenCalled();
});

test("pending disables submission and error is announced", () => {
  render(<CancelOrderFormView
    {...props}
    pending
    state={{ status: "error", message: "取消訂單失敗，請稍後再試。" }}
  />);
  expect(screen.getByRole("alert")).toHaveTextContent("取消訂單失敗");
  expect(screen.getByRole("button", { name: "取消處理中…" })).toBeDisabled();
});

test("success replaces the form with an announced confirmation", () => {
  render(<CancelOrderFormView
    {...props}
    state={{ status: "success", message: "訂單已取消。" }}
  />);
  expect(screen.getByRole("status")).toHaveTextContent("訂單已取消。");
  expect(screen.queryByRole("button", { name: "取消訂單" })).not.toBeInTheDocument();
});
