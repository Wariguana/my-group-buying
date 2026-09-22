import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PublicHeader } from "@/app/group-buys/public-ui";

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

test("signed-out public header offers only LINE Login", async () => {
  render(<PublicHeader customerAccount={null} />);
  expect(screen.getByRole("link", { name: "LINE 登入" })).toHaveAttribute("href", "/api/auth/line/start");
  expect(screen.queryByRole("button", { name: "登出" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "我的訂單" })).not.toBeInTheDocument();
});

test("signed-in public header shows mutable display metadata and POST logout", async () => {
  render(<PublicHeader customerAccount={{ displayName: "LINE 顯示名稱" }} />);
  expect(screen.getByText("LINE 顯示名稱")).toBeVisible();
  const button = screen.getByRole("button", { name: "登出" });
  expect(button.closest("form")).toHaveAttribute("method", "post");
  expect(button.closest("form")).toHaveAttribute("action", "/api/auth/line/logout");
  expect(screen.queryByRole("link", { name: "LINE 登入" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "我的訂單" })).toHaveAttribute("href", "/my/orders");
});
