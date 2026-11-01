import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { StorefrontSearchForm } from "@/app/storefront-search";

afterEach(cleanup);

test("shared search submits the existing GET query and keeps category and legacy view", () => {
  render(<StorefrontSearchForm query={{ q: "咖啡", category: "food", view: "featured" }} />);
  const form = screen.getByRole("search") as HTMLFormElement;
  expect(form).toHaveAttribute("action", "/");
  expect(new FormData(form).get("category")).toBe("food");
  expect(new FormData(form).get("view")).toBe("featured");
  const input = screen.getByRole("textbox", { name: "搜尋商品" });
  expect(input).toHaveAttribute("enterkeyhint", "search");
  fireEvent.change(input, { target: { value: "草莓" } });
  expect(new FormData(form).get("q")).toBe("草莓");
});

test("clear input preserves filters and returns keyboard focus to search", () => {
  render(<StorefrontSearchForm query={{ q: "咖啡", category: "food" }} />);
  fireEvent.click(screen.getByRole("button", { name: "清除輸入" }));
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(screen.getByRole("textbox")).toHaveFocus();
  expect(new FormData(screen.getByRole("search") as HTMLFormElement).get("category")).toBe("food");
  expect(screen.queryByRole("button", { name: "清除輸入" })).not.toBeInTheDocument();
});
