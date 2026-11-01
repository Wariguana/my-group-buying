import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PublicHeader } from "@/app/group-buys/public-ui";

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

test("shared client header only receives public display metadata", () => {
  const account = { displayName: "顧客", pictureUrl: "/profile.webp", id: "private-customer-id", lineUserId: "private-provider-identity" };
  expect(PublicHeader({ customerAccount: account }).props.account).toEqual({ displayName: "顧客", pictureUrl: "/profile.webp" });
});

test("signed-out public header offers only LINE Login", async () => {
  render(<PublicHeader customerAccount={null} />);
  expect(screen.getByRole("link", { name: "LINE 登入" })).toHaveAttribute("href", "/api/auth/line/start");
  expect(screen.queryByRole("button", { name: "登出" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "我的訂單" })).not.toBeInTheDocument();
});

test("signed-in public header shows mutable display metadata and POST logout", async () => {
  const { container } = render(<PublicHeader customerAccount={{ displayName: "LINE 顯示名稱", pictureUrl: "/profile.webp" }} />);
  const summary = screen.getByLabelText("LINE 顯示名稱，帳號選單");
  expect(summary.querySelector("img")).toHaveAttribute("src", "/profile.webp");
  expect(within(container.querySelector(".qbuy-account-menu")!).getByText("LINE 顯示名稱")).not.toBeVisible();
  fireEvent.click(summary);
  expect(within(container.querySelector(".qbuy-account-menu")!).getByText("LINE 顯示名稱")).toBeVisible();
  const button = screen.getByRole("button", { name: "登出" });
  expect(button.closest("form")).toHaveAttribute("method", "post");
  expect(button.closest("form")).toHaveAttribute("action", "/api/auth/line/logout");
  expect(screen.queryByRole("link", { name: "LINE 登入" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "我的訂單" })).toHaveAttribute("href", "/my/orders");
});
