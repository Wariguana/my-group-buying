import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/app/admin/(protected)/orders/[publicCode]/pickup-actions", () => ({ submitAdminPickupOrderAction: vi.fn() }));
import { AdminPickupOrderFormView } from "@/app/admin/(protected)/orders/[publicCode]/pickup-form";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const props = { publicCode: "ord-AbCdEf0123_-xyZ9", state: { status: "idle" as const }, pending: false, formAction: vi.fn() };

test("form includes only publicCode, irreversible warning and Admin cutoff explanation", () => {
  render(<AdminPickupOrderFormView {...props} />);
  expect(screen.getByText("取貨後無法復原，且無法取消訂單。")).toBeVisible();
  expect(screen.getByText("請確認商品已交付。")).toBeVisible();
  const form = screen.getByRole("button", { name: "標記已取貨" }).closest("form")!;
  expect([...new FormData(form).entries()]).toEqual([["publicCode", props.publicCode]]);
});

test("declining irreversible confirmation prevents submission", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<AdminPickupOrderFormView {...props} />);
  expect(fireEvent.submit(screen.getByRole("button").closest("form")!)).toBe(false);
  expect(confirm).toHaveBeenCalledWith("取貨後無法復原，且無法取消訂單，確定要標記已取貨嗎？");
  expect(props.formAction).not.toHaveBeenCalled();
});

test("pending disables repeat submissions and announces errors", () => {
  const confirm = vi.spyOn(window, "confirm");
  render(<AdminPickupOrderFormView {...props} pending state={{ status: "error", message: "取消失敗" }} />);
  expect(screen.getByRole("button", { name: "取貨處理中…" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("取消失敗");
  expect(fireEvent.submit(screen.getByRole("button").closest("form")!)).toBe(false);
  expect(confirm).not.toHaveBeenCalled();
});

test("success announces completion and removes cancel control", () => {
  render(<AdminPickupOrderFormView {...props} state={{ status: "success", message: "訂單已取貨。" }} />);
  expect(screen.getByRole("status")).toHaveTextContent("訂單已取貨。");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
