import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/app/admin/(protected)/orders/[publicCode]/cancel-actions", () => ({ submitAdminCancelOrderAction: vi.fn() }));
import { AdminCancelOrderFormView } from "@/app/admin/(protected)/orders/[publicCode]/cancel-form";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const props = { publicCode: "ord-AbCdEf0123_-xyZ9", state: { status: "idle" as const }, pending: false, formAction: vi.fn() };

test("form includes only publicCode, irreversible warning and Admin cutoff explanation", () => {
  render(<AdminCancelOrderFormView {...props} />);
  expect(screen.getByText("取消後無法復原。")).toBeVisible();
  expect(screen.getByText("管理員可在團購截止後取消訂單。")).toBeVisible();
  const form = screen.getByRole("button", { name: "取消訂單" }).closest("form")!;
  expect([...new FormData(form).entries()]).toEqual([["publicCode", props.publicCode]]);
});

test("declining irreversible confirmation prevents submission", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<AdminCancelOrderFormView {...props} />);
  expect(fireEvent.submit(screen.getByRole("button").closest("form")!)).toBe(false);
  expect(confirm).toHaveBeenCalledWith("取消後無法復原，確定要取消訂單嗎？");
  expect(props.formAction).not.toHaveBeenCalled();
});

test("pending disables repeat submissions and announces errors", () => {
  const confirm = vi.spyOn(window, "confirm");
  render(<AdminCancelOrderFormView {...props} pending state={{ status: "error", message: "取消失敗" }} />);
  expect(screen.getByRole("button", { name: "取消處理中…" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("取消失敗");
  expect(fireEvent.submit(screen.getByRole("button").closest("form")!)).toBe(false);
  expect(confirm).not.toHaveBeenCalled();
});

test("success announces completion and removes cancel control", () => {
  render(<AdminCancelOrderFormView {...props} state={{ status: "success", message: "訂單已取消。" }} />);
  expect(screen.getByRole("status")).toHaveTextContent("訂單已取消。");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
