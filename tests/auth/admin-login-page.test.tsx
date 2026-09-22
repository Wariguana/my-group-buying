// @vitest-environment jsdom
import { randomBytes } from "node:crypto";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));
vi.mock("@/lib/auth/current-admin", () => ({ getCurrentAdmin: boundary.getCurrentAdmin }));

import AdminLoginPage from "@/app/admin/login/page";

beforeEach(() => {
  vi.resetAllMocks();
  boundary.getCurrentAdmin.mockResolvedValue(null);
});

afterEach(cleanup);

test("logout failure marker shows only the generic failure notice", async () => {
  const token = randomBytes(32).toString("base64url");
  const internalError = `database unavailable for ${token}`;

  render(await AdminLoginPage({ searchParams: Promise.resolve({ logout: "failed" }) }));

  const notice = screen.getByRole("alert");
  expect(notice).toHaveTextContent("登出失敗，請稍後再試。");
  expect(notice).not.toHaveTextContent(token);
  expect(notice).not.toHaveTextContent(internalError);
});
