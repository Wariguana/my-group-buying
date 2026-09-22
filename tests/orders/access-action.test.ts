// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  getOrderForAccess: vi.fn(),
  cookies: vi.fn(),
  setCookie: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/orders/access-service", () => ({
  ORDER_ACCESS_FAILURE_MESSAGE: "找不到訂單或訂單管理憑證無效。",
  getOrderForAccess: boundary.getOrderForAccess,
}));
vi.mock("next/headers", () => ({ cookies: boundary.cookies }));
vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));

import { submitOrderAccessAction } from "@/app/orders/[publicCode]/actions";
import { initialOrderAccessActionState } from "@/app/orders/[publicCode]/access-action-state";

const publicCode = "ord-AbCdEf0123_-xyZ9";
const managementCode = "A".repeat(43);

function form(code = publicCode, token = managementCode) {
  const data = new FormData();
  data.set("publicCode", code);
  data.set("managementCode", token);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  boundary.getOrderForAccess.mockResolvedValue({ ok: true, value: {} });
  boundary.cookies.mockResolvedValue({ set: boundary.setCookie });
});

test("valid management code sets the scoped HttpOnly cookie and redirects without token transport", async () => {
  await submitOrderAccessAction(initialOrderAccessActionState, form());

  expect(boundary.getOrderForAccess).toHaveBeenCalledExactlyOnceWith(publicCode, {
    accessToken: managementCode,
  });
  expect(boundary.setCookie).toHaveBeenCalledExactlyOnceWith("order_access", managementCode, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: `/orders/${publicCode}`,
  });
  expect(boundary.redirect).toHaveBeenCalledExactlyOnceWith(`/orders/${publicCode}`);
  expect(boundary.redirect.mock.calls[0][0]).not.toContain(managementCode);
});

test("invalid management code returns only the generic message and does not echo the token", async () => {
  boundary.getOrderForAccess.mockResolvedValue({
    ok: false,
    message: "找不到訂單或訂單管理憑證無效。",
  });

  const result = await submitOrderAccessAction(initialOrderAccessActionState, form());

  expect(result).toEqual({ status: "error", message: "找不到訂單或訂單管理憑證無效。" });
  expect(JSON.stringify(result)).not.toContain(managementCode);
  expect(boundary.setCookie).not.toHaveBeenCalled();
  expect(boundary.redirect).not.toHaveBeenCalled();
});

test("cookie failure stays generic and does not redirect", async () => {
  boundary.cookies.mockRejectedValue(new Error("private cookie failure"));
  await expect(submitOrderAccessAction(initialOrderAccessActionState, form())).resolves.toEqual({
    status: "error",
    message: "找不到訂單或訂單管理憑證無效。",
  });
  expect(boundary.redirect).not.toHaveBeenCalled();
});
