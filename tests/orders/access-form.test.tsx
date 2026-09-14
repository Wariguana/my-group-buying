import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/app/orders/[publicCode]/actions", () => ({
  submitOrderAccessAction: vi.fn(),
}));

import { OrderAccessFormView } from "@/app/orders/[publicCode]/access-form";

afterEach(cleanup);

const props = {
  publicCode: "ord-AbCdEf0123_-xyZ9",
  state: { status: "idle" as const },
  pending: false,
  formAction: vi.fn(),
};

test("renders only the route reference and management-code input", () => {
  render(<OrderAccessFormView {...props} />);
  expect(screen.getByText("ord-AbCdEf0123_-xyZ9")).toBeVisible();
  expect(screen.getByLabelText("訂單管理碼")).toBeRequired();
  expect(screen.queryByLabelText(/手機/)).not.toBeInTheDocument();
});

test("renders generic access failure and pending state safely", () => {
  render(<OrderAccessFormView
    {...props}
    state={{ status: "error", message: "找不到訂單或訂單管理憑證無效。" }}
    pending
  />);
  expect(screen.getByRole("alert")).toHaveTextContent("找不到訂單或訂單管理憑證無效");
  expect(screen.getByLabelText("訂單管理碼")).toBeDisabled();
  expect(screen.getByRole("button", { name: "驗證中…" })).toBeDisabled();
});
