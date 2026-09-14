// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({ requireAdmin: vi.fn(), cancelOrderAsAdmin: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-admin", () => ({ requireAdmin: boundary.requireAdmin }));
vi.mock("@/lib/orders/cancel-service", () => ({ cancelOrderAsAdmin: boundary.cancelOrderAsAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidatePath }));

import { submitAdminCancelOrderAction } from "@/app/admin/(protected)/orders/[publicCode]/cancel-actions";
import { CancelOrderError } from "@/lib/orders/cancel-errors";

const publicCode = "ord-AbCdEf0123_-xyZ9";
const idle = { status: "idle" as const };
function form() {
  const data = new FormData();
  data.set("publicCode", publicCode);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  boundary.requireAdmin.mockResolvedValue({ id: "admin" });
  boundary.cancelOrderAsAdmin.mockResolvedValue({ publicCode, status: "CANCELLED", cancelledAt: new Date() });
});

test("auth precedes parsing and cancellation; only the exact code reaches the service", async () => {
  const data = form();
  const entries = vi.spyOn(data, "entries");
  const result = await submitAdminCancelOrderAction(idle, data);
  expect(boundary.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(entries.mock.invocationCallOrder[0]);
  expect(entries.mock.invocationCallOrder[0]).toBeLessThan(boundary.cancelOrderAsAdmin.mock.invocationCallOrder[0]);
  expect(boundary.cancelOrderAsAdmin).toHaveBeenCalledExactlyOnceWith(publicCode);
  expect(result).toEqual({ status: "success", message: "訂單已取消。" });
  expect(boundary.revalidatePath.mock.calls).toEqual([[`/admin/orders/${publicCode}`], ["/admin/orders"], [`/orders/${publicCode}`]]);
});

test.each(["unauthenticated", "expired", "inactive"])("%s Admin never parses or mutates", async () => {
  const redirect = new Error("NEXT_REDIRECT");
  boundary.requireAdmin.mockRejectedValue(redirect);
  const data = form();
  const entries = vi.spyOn(data, "entries");
  await expect(submitAdminCancelOrderAction(idle, data)).rejects.toBe(redirect);
  expect(entries).not.toHaveBeenCalled();
  expect(boundary.cancelOrderAsAdmin).not.toHaveBeenCalled();
});

test.each(["duplicate", "missing", "malformed", "whitespace", "file"])("%s publicCode fails closed", async (kind) => {
  const data = form();
  if (kind === "duplicate") data.append("publicCode", publicCode);
  if (kind === "missing") data.delete("publicCode");
  if (kind === "malformed") data.set("publicCode", "bad");
  if (kind === "whitespace") data.set("publicCode", ` ${publicCode}`);
  if (kind === "file") data.set("publicCode", new Blob([publicCode]), "code.txt");
  await expect(submitAdminCancelOrderAction(idle, data)).resolves.toEqual({ status: "error", message: "訂單資料無效。" });
  expect(boundary.cancelOrderAsAdmin).not.toHaveBeenCalled();
});

test.each(["managementCode", "accessToken", "accessTokenHash", "phone", "customerId", "status", "stock", "cancelledAt", "isAdmin", "ignoreCutoff", "bypassCutoff", "policy"])("rejects extra %s input", async (field) => {
  const data = form();
  data.set(field, "forged");
  await expect(submitAdminCancelOrderAction(idle, data)).resolves.toMatchObject({ status: "error" });
  expect(boundary.cancelOrderAsAdmin).not.toHaveBeenCalled();
});

test("framework action metadata is ignored, never forwarded", async () => {
  const data = form();
  data.set("$ACTION_ID_test", "transport");
  await expect(submitAdminCancelOrderAction(idle, data)).resolves.toMatchObject({ status: "success" });
  expect(boundary.cancelOrderAsAdmin).toHaveBeenCalledExactlyOnceWith(publicCode);
});

test.each([
  [new CancelOrderError("ACCESS_DENIED"), "找不到訂單。"],
  [new CancelOrderError("CONFLICT_RETRY_EXHAUSTED"), "同時處理人數較多，請再試一次。"],
  [new CancelOrderError("CANCELLATION_CLOSED"), "取消訂單失敗，請稍後再試。"],
  [new CancelOrderError("FAILED"), "取消訂單失敗，請稍後再試。"],
  [new Error("Prisma SQL stock=123 order-id token"), "取消訂單失敗，請稍後再試。"],
])("maps failure safely: %s", async (error, message) => {
  boundary.cancelOrderAsAdmin.mockRejectedValue(error);
  await expect(submitAdminCancelOrderAction(idle, form())).resolves.toEqual({ status: "error", message });
  expect(boundary.revalidatePath).not.toHaveBeenCalled();
});

test("committed cancellation remains success when every revalidation fails", async () => {
  boundary.revalidatePath.mockImplementation(() => { throw new Error("private cache error"); });
  await expect(submitAdminCancelOrderAction(idle, form())).resolves.toEqual({ status: "success", message: "訂單已取消。" });
  expect(boundary.cancelOrderAsAdmin).toHaveBeenCalledTimes(1);
  expect(boundary.revalidatePath).toHaveBeenCalledTimes(3);
});
