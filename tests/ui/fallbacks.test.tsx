import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import ErrorPage from "@/app/error";
import Loading from "@/app/loading";
import NotFound from "@/app/not-found";

afterEach(cleanup);
test("shared error recovery explains ambiguous transactions and retries explicitly", () => {
  const retry = vi.fn();
  render(<ErrorPage retry={retry}/>);
  expect(screen.getByRole("alert")).toHaveTextContent("避免重複付款");
  expect(screen.getByRole("link", { name: "查看我的訂單" })).toHaveAttribute("href", "/my/orders");
  fireEvent.click(screen.getByRole("button", { name: "重新載入" }));
  expect(retry).toHaveBeenCalledTimes(1);
});
test("shared loading announces progress without exposing skeleton content", () => {
  render(<Loading/>);
  expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("status")).toHaveTextContent("正在載入");
});
test("not found recovery preserves privacy and offers useful navigation", () => {
  render(<NotFound/>);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("找不到這個頁面");
  expect(screen.getByRole("link", { name: "返回商城" })).toHaveAttribute("href", "/");
});
