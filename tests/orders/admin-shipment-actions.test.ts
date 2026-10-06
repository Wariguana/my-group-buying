// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
const boundary = vi.hoisted(() => ({
  requireAdmin: vi.fn(), revalidatePath: vi.fn(), createShipmentAsAdmin: vi.fn(),
  markShipmentShippedAsAdmin: vi.fn(), markShipmentArrivedAsAdmin: vi.fn(),
  markShipmentReturnedAsAdmin: vi.fn(), voidShipmentAsAdmin: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-admin", () => ({ requireAdmin: boundary.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidatePath }));
vi.mock("@/lib/shipments/service", () => boundary);
import {
  submitAdminCreateShipmentAction, submitAdminShipShipmentAction, submitAdminArriveShipmentAction,
  submitAdminReturnShipmentAction, submitAdminVoidShipmentAction,
} from "@/app/admin/(protected)/orders/[publicCode]/shipment-actions";
import { ShipmentError } from "@/lib/shipments/errors";

const publicCode = "ord-AbCdEf0123_-xyZ9";
const shipmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const idle = { status: "idle" as const };
const cases = [
  ["create", submitAdminCreateShipmentAction, boundary.createShipmentAsAdmin],
  ["ship", submitAdminShipShipmentAction, boundary.markShipmentShippedAsAdmin],
  ["arrive", submitAdminArriveShipmentAction, boundary.markShipmentArrivedAsAdmin],
  ["return", submitAdminReturnShipmentAction, boundary.markShipmentReturnedAsAdmin],
  ["void", submitAdminVoidShipmentAction, boundary.voidShipmentAsAdmin],
] as const;
const mutations = cases.map((entry) => entry[2]);
function form(kind: string) {
  const data = new FormData();
  if (kind === "create") { data.set("publicCode", publicCode); data.set("trackingNumber", "  任意編號 / 123  "); }
  else data.set("shipmentId", shipmentId);
  return data;
}
beforeEach(() => { vi.resetAllMocks(); boundary.requireAdmin.mockResolvedValue({ id: "admin" }); });

for (const [kind, action, mutation] of cases) {
  test(`${kind}: authenticates before parsing, calls one service with exact authority, ignores only metadata`, async () => {
    const data = form(kind);
    data.set("$ACTION_ID_transport", "ignored");
    const entries = vi.spyOn(data, "entries");
    expect(await action(idle, data)).toMatchObject({ status: "success" });
    expect(boundary.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(entries.mock.invocationCallOrder[0]);
    expect(entries.mock.invocationCallOrder[0]).toBeLessThan(mutation.mock.invocationCallOrder[0]);
    expect(mutation.mock.calls).toEqual(kind === "create" ? [[publicCode, "任意編號 / 123"]] : [[shipmentId]]);
    expect(mutations.reduce((count, mock) => count + mock.mock.calls.length, 0)).toBe(1);
    expect(boundary.revalidatePath.mock.calls).toEqual(kind === "create"
      ? [["/admin/orders"], [`/admin/orders/${publicCode}`], [`/orders/${publicCode}`]]
      : [["/admin/orders"], ["/admin/orders/[publicCode]", "page"], ["/orders/[publicCode]", "page"]]);
  });
  test.each(["unauthenticated", "expired", "inactive"])(`${kind}: %s cannot parse or mutate`, async () => {
    const error = new Error("NEXT_REDIRECT");
    boundary.requireAdmin.mockRejectedValue(error);
    const data = form(kind); const entries = vi.spyOn(data, "entries");
    await expect(action(idle, data)).rejects.toBe(error);
    expect(entries).not.toHaveBeenCalled();
    for (const mock of mutations) expect(mock).not.toHaveBeenCalled();
  });
  const fields = kind === "create" ? ["publicCode", "trackingNumber"] : ["shipmentId"];
  for (const field of fields) {
    test.each(["duplicate", "missing", "file", "invalid"])(`${kind}: ${field} %s rejected`, async (problem) => {
      const data = form(kind);
      if (problem === "duplicate") data.append(field, data.get(field) as string);
      if (problem === "missing") data.delete(field);
      if (problem === "file") data.set(field, new Blob(["secret"]), "input.txt");
      if (problem === "invalid") data.set(field, field === "trackingNumber" ? " ".repeat(5) : "bad");
      await expect(action(idle, data)).resolves.toEqual({ status: "error", message: "物流資料無效，請確認物流編號。" });
      for (const mock of mutations) expect(mock).not.toHaveBeenCalled();
      expect(boundary.revalidatePath).not.toHaveBeenCalled();
    });
  }
  test.each(["provider", "recipientName", "recipientPhone", "sevenElevenStoreId", "sevenElevenStoreName", "sevenElevenStoreAddress",
    "status", "state", "createdAt", "shippedAt", "arrivedAt", "returnedAt", "voidedAt", "pickedUpAt", "shipmentRequired",
    "bypassCutoff", "policy", "isAdmin", "orderId", "$ACTION", "unexpected", kind === "create" ? "shipmentId" : "publicCode"
  ])(`${kind}: rejects unexpected %s`, async (field) => {
    const data = form(kind); data.set(field, "forged");
    expect(await action(idle, data)).toMatchObject({ status: "error" });
    for (const mock of mutations) expect(mock).not.toHaveBeenCalled();
  });
  test.each([
    [new ShipmentError("INVALID_SHIPMENT_INPUT"), "物流資料無效，請確認物流編號。"],
    [new ShipmentError("ACCESS_DENIED"), "找不到訂單或物流紀錄。"],
    [new ShipmentError("ORDER_NOT_ELIGIBLE"), "此訂單目前無法建立物流紀錄，請重新整理確認訂單與截止時間。"],
    [new ShipmentError("ACTIVE_SHIPMENT_EXISTS"), "訂單已有進行中的物流紀錄。"],
    [new ShipmentError("TRACKING_NUMBER_IN_USE"), "此物流編號已使用，請確認後再試。"],
    [new ShipmentError("INVALID_TRANSITION"), "物流狀態已變更或不允許此操作，請重新整理。"],
    [new ShipmentError("CONFLICT_RETRY_EXHAUSTED"), "同時處理人數較多，請再試一次。"],
    [new ShipmentError("FAILED"), "物流作業失敗，請稍後再試。"],
    [new Error("SQL Prisma constraint private-id"), "物流作業失敗，請稍後再試。"],
  ])(`${kind}: sanitizes %s`, async (error, message) => {
    mutation.mockRejectedValue(error);
    expect(await action(idle, form(kind))).toEqual({ status: "error", message });
    expect(boundary.revalidatePath).not.toHaveBeenCalled();
  });
  test(`${kind}: independent failed cache invalidations cannot disguise committed success`, async () => {
    boundary.revalidatePath.mockImplementation(() => { throw new Error("cache failure"); });
    expect(await action(idle, form(kind))).toMatchObject({ status: "success" });
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(boundary.revalidatePath).toHaveBeenCalledTimes(3);
  });
}
