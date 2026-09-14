// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({ requireAdmin: vi.fn(), markOrderPaidAsAdmin: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-admin", () => ({ requireAdmin: boundary.requireAdmin }));
vi.mock("@/lib/orders/payment-service", () => ({ markOrderPaidAsAdmin: boundary.markOrderPaidAsAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidatePath }));

import { submitAdminPaymentOrderAction } from "@/app/admin/(protected)/orders/[publicCode]/payment-actions";
import { PaymentOrderError } from "@/lib/orders/payment-errors";

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
  boundary.markOrderPaidAsAdmin.mockResolvedValue({ publicCode, paidAt: new Date() });
});

test("auth precedes parsing and payment; only the exact code reaches the service", async () => {
  const data = form();
  const entries = vi.spyOn(data, "entries");
  const result = await submitAdminPaymentOrderAction(idle, data);
  expect(boundary.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(entries.mock.invocationCallOrder[0]);
  expect(entries.mock.invocationCallOrder[0]).toBeLessThan(boundary.markOrderPaidAsAdmin.mock.invocationCallOrder[0]);
  expect(boundary.markOrderPaidAsAdmin).toHaveBeenCalledExactlyOnceWith(publicCode);
  expect(result).toEqual({ status: "success", message: "訂單已確認收款。" });
  expect(boundary.revalidatePath.mock.calls).toEqual([[`/admin/orders/${publicCode}`], ["/admin/orders"], [`/orders/${publicCode}`]]);
});

test.each(["unauthenticated", "expired", "inactive"])("%s Admin never parses or mutates", async () => {
  const redirect = new Error("NEXT_REDIRECT");
  boundary.requireAdmin.mockRejectedValue(redirect);
  const data = form();
  const entries = vi.spyOn(data, "entries");
  await expect(submitAdminPaymentOrderAction(idle, data)).rejects.toBe(redirect);
  expect(entries).not.toHaveBeenCalled();
  expect(boundary.markOrderPaidAsAdmin).not.toHaveBeenCalled();
});

test.each(["duplicate", "missing", "malformed", "whitespace", "file"])("%s publicCode fails closed", async (kind) => {
  const data = form();
  if (kind === "duplicate") data.append("publicCode", publicCode);
  if (kind === "missing") data.delete("publicCode");
  if (kind === "malformed") data.set("publicCode", "bad");
  if (kind === "whitespace") data.set("publicCode", ` ${publicCode}`);
  if (kind === "file") data.set("publicCode", new Blob([publicCode]), "code.txt");
  await expect(submitAdminPaymentOrderAction(idle, data)).resolves.toEqual({ status: "error", message: "訂單資料無效。" });
  expect(boundary.markOrderPaidAsAdmin).not.toHaveBeenCalled();
});

test.each(["amount", "totalAmount", "paymentMethod", "pickedUpAt", "managementCode", "accessToken", "accessTokenHash", "phone", "customerId", "status", "stock", "cancelledAt", "paidAt", "isAdmin", "ignoreCutoff", "bypassCutoff", "policy"])("rejects extra %s input", async (field) => {
  const data = form();
  data.set(field, "forged");
  await expect(submitAdminPaymentOrderAction(idle, data)).resolves.toMatchObject({ status: "error" });
  expect(boundary.markOrderPaidAsAdmin).not.toHaveBeenCalled();
});

test("framework action metadata is ignored, never forwarded", async () => {
  const data = form();
  data.set("$ACTION_ID_test", "transport");
  await expect(submitAdminPaymentOrderAction(idle, data)).resolves.toMatchObject({ status: "success" });
  expect(boundary.markOrderPaidAsAdmin).toHaveBeenCalledExactlyOnceWith(publicCode);
});

test.each([
  [new PaymentOrderError("ACCESS_DENIED"), "找不到訂單。"],
  [new PaymentOrderError("CONFLICT_RETRY_EXHAUSTED"), "同時處理人數較多，請再試一次。"],
  [new PaymentOrderError("CANCELLED"), "已取消的訂單無法確認收款。"],
  [new PaymentOrderError("FAILED"), "確認收款失敗，請稍後再試。"],
  [new Error("Prisma SQL stock=123 order-id token"), "確認收款失敗，請稍後再試。"],
])("maps failure safely: %s", async (error, message) => {
  boundary.markOrderPaidAsAdmin.mockRejectedValue(error);
  await expect(submitAdminPaymentOrderAction(idle, form())).resolves.toEqual({ status: "error", message });
  expect(boundary.revalidatePath).not.toHaveBeenCalled();
});

test("committed payment remains success when every revalidation fails", async () => {
  boundary.revalidatePath.mockImplementation(() => { throw new Error("private cache error"); });
  await expect(submitAdminPaymentOrderAction(idle, form())).resolves.toEqual({ status: "success", message: "訂單已確認收款。" });
  expect(boundary.markOrderPaidAsAdmin).toHaveBeenCalledTimes(1);
  expect(boundary.revalidatePath).toHaveBeenCalledTimes(3);
});
