import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { FormField } from "@/components/ui/primitives";

afterEach(cleanup);
test("server validation errors are associated with the field and preserve existing help", () => {
  const { rerender } = render(<FormField label="商品名稱" name="name" errors={["名稱過長", "請縮短名稱"]}><input id="name" aria-describedby="name-help" /></FormField>);
  const field = screen.getByLabelText("商品名稱");
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(field).toHaveAttribute("aria-describedby", "name-help name-error");
  expect(document.querySelectorAll("#name-error")).toHaveLength(1);
  expect(screen.getByRole("alert")).toHaveTextContent("名稱過長請縮短名稱");
  rerender(<FormField label="商品名稱" name="name"><input id="name" aria-describedby="name-help" /></FormField>);
  expect(field).not.toHaveAttribute("aria-invalid");
  expect(field).toHaveAttribute("aria-describedby", "name-help");
  expect(screen.queryByRole("alert")).toBeNull();
});
