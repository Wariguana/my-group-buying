// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  cancelOrder: vi.fn(),
  cookies: vi.fn(),
  getCookie: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/orders/cancel-service", () => ({ cancelOrder: boundary.cancelOrder }));
vi.mock("next/headers", () => ({ cookies: boundary.cookies }));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidatePath }));

import { initialCancelOrderActionState } from "@/app/orders/[publicCode]/cancel-action-state";
import { submitCancelOrderAction } from "@/app/orders/[publicCode]/cancel-actions";
import { CancelOrderError, type CancelOrderErrorCode } from "@/lib/orders/cancel-errors";

const publicCode = "ord-AbCdEf0123_-xyZ9";
const token = "A".repeat(43);

function form() {
  const data = new FormData();
  data.set("publicCode", publicCode);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  boundary.cookies.mockResolvedValue({ get: boundary.getCookie });
  boundary.getCookie.mockReturnValue({ value: token });
  boundary.cancelOrder.mockResolvedValue({
    publicCode,
    status: "CANCELLED",
    cancelledAt: new Date("2026-09-14T04:00:00.000Z"),
  });
});

test("reads token only from HttpOnly cookie and passes exact publicCode/token to service", async () => {
  const data = form();
  data.set("managementCode", "B".repeat(43));
  const result = await submitCancelOrderAction(initialCancelOrderActionState, data);
  expect(boundary.getCookie).toHaveBeenCalledExactlyOnceWith("order_access");
  expect(boundary.cancelOrder).toHaveBeenCalledExactlyOnceWith(publicCode, token);
  expect(result).toEqual({ status: "success", message: "訂單已取消。" });
  expect(Object.keys(result).sort()).toEqual(["message", "status"]);
  expect(JSON.stringify(result)).not.toMatch(/token|hash|order-id/i);
  expect(boundary.revalidatePath).toHaveBeenCalledExactlyOnceWith(`/orders/${publicCode}`);
});

test("duplicate publicCode fails closed before cookie or service access", async () => {
  const data = form();
  data.append("publicCode", publicCode);
  await expect(submitCancelOrderAction(initialCancelOrderActionState, data)).resolves.toEqual({
    status: "error",
    message: "找不到訂單或訂單管理憑證無效。",
  });
  expect(boundary.cookies).not.toHaveBeenCalled();
  expect(boundary.cancelOrder).not.toHaveBeenCalled();
});

test("missing cookie is denied by the service without accepting FormData token", async () => {
  boundary.getCookie.mockReturnValue(undefined);
  boundary.cancelOrder.mockRejectedValue(new CancelOrderError("ACCESS_DENIED"));
  const data = form();
  data.set("managementCode", token);
  await expect(submitCancelOrderAction(initialCancelOrderActionState, data)).resolves.toEqual({
    status: "error",
    message: "找不到訂單或訂單管理憑證無效。",
  });
  expect(boundary.cancelOrder).toHaveBeenCalledExactlyOnceWith(publicCode, undefined);
});

test.each([
  ["ACCESS_DENIED", "找不到訂單或訂單管理憑證無效。"],
  ["CANCELLATION_CLOSED", "此團購已截止，訂單無法自行取消。"],
  ["ALREADY_PICKED_UP", "訂單已取貨，無法取消。"],
  ["CONFLICT_RETRY_EXHAUSTED", "同時處理人數較多，請再試一次。"],
  ["FAILED", "取消訂單失敗，請稍後再試。"],
] as const)("maps %s to a safe message", async (code, message) => {
  boundary.cancelOrder.mockRejectedValue(new CancelOrderError(code as CancelOrderErrorCode));
  await expect(submitCancelOrderAction(initialCancelOrderActionState, form())).resolves.toEqual({
    status: "error",
    message,
  });
  expect(boundary.revalidatePath).not.toHaveBeenCalled();
});

test("unknown and cookie failures map to safe FAILED", async () => {
  boundary.cancelOrder.mockRejectedValue(new Error("private SQL"));
  await expect(submitCancelOrderAction(initialCancelOrderActionState, form())).resolves.toEqual({
    status: "error",
    message: "取消訂單失敗，請稍後再試。",
  });
  boundary.cookies.mockRejectedValue(new Error("private cookie failure"));
  await expect(submitCancelOrderAction(initialCancelOrderActionState, form())).resolves.toEqual({
    status: "error",
    message: "取消訂單失敗，請稍後再試。",
  });
});

test("post-commit revalidation failure still returns success and never repeats cancellation", async () => {
  boundary.revalidatePath.mockImplementation(() => {
    throw new Error("private revalidation failure");
  });
  const result = await submitCancelOrderAction(initialCancelOrderActionState, form());
  expect(result).toEqual({ status: "success", message: "訂單已取消。" });
  expect(boundary.cancelOrder).toHaveBeenCalledTimes(1);
  expect(boundary.revalidatePath).toHaveBeenCalledTimes(1);
});
