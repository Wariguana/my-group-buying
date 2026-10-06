"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-admin";
import { ShipmentError, type ShipmentErrorCode } from "@/lib/shipments/errors";
import {
  createShipmentAsAdmin, markShipmentShippedAsAdmin, markShipmentArrivedAsAdmin,
  markShipmentReturnedAsAdmin, voidShipmentAsAdmin,
} from "@/lib/shipments/service";
import { adminCreateShipmentInputSchema, adminTransitionShipmentInputSchema } from "@/lib/shipments/validation";
import type { AdminShipmentActionState } from "./shipment-action-state";

const messages: Record<ShipmentErrorCode, string> = {
  INVALID_SHIPMENT_INPUT: "物流資料無效，請確認物流編號。",
  ACCESS_DENIED: "找不到訂單或物流紀錄。",
  ORDER_NOT_ELIGIBLE: "此訂單目前無法建立物流紀錄，請重新整理確認訂單與截止時間。",
  ACTIVE_SHIPMENT_EXISTS: "訂單已有進行中的物流紀錄。",
  TRACKING_NUMBER_IN_USE: "此物流編號已使用，請確認後再試。",
  INVALID_TRANSITION: "物流狀態已變更或不允許此操作，請重新整理。",
  CONFLICT_RETRY_EXHAUSTED: "同時處理人數較多，請再試一次。",
  FAILED: "物流作業失敗，請稍後再試。",
};

function businessInput(formData: FormData): unknown {
  const entries = [...formData.entries()].filter(([key]) => !key.startsWith("$ACTION_"));
  return new Set(entries.map(([key]) => key)).size === entries.length
    ? Object.fromEntries(entries) : null;
}

function failure(error: unknown): AdminShipmentActionState {
  return { status: "error", message: messages[error instanceof ShipmentError ? error.code : "FAILED"] };
}

function revalidateDetails(publicCode?: string) {
  try { revalidatePath("/admin/orders"); }
  catch { /* Already committed: list cache failure cannot undo the mutation. */ }
  for (const path of publicCode
    ? [`/admin/orders/${publicCode}`, `/orders/${publicCode}`]
    : ["/admin/orders/[publicCode]", "/orders/[publicCode]"]) {
    try {
      if (publicCode) revalidatePath(path);
      else revalidatePath(path, "page");
    } catch {
      // Already committed: cache failure must not invite a mutation retry.
    }
  }
}

export async function submitAdminCreateShipmentAction(
  _previousState: AdminShipmentActionState, formData: FormData,
): Promise<AdminShipmentActionState> {
  await requireAdmin();
  const parsed = adminCreateShipmentInputSchema.safeParse(businessInput(formData));
  if (!parsed.success) return failure(new ShipmentError("INVALID_SHIPMENT_INPUT"));
  try {
    await createShipmentAsAdmin(parsed.data.publicCode, parsed.data.trackingNumber);
  } catch (error) { return failure(error); }
  revalidateDetails(parsed.data.publicCode);
  return { status: "success", message: "物流紀錄已建立。" };
}

async function submitTransition(
  formData: FormData, operation: (id: string) => Promise<unknown>, message: string,
): Promise<AdminShipmentActionState> {
  const parsed = adminTransitionShipmentInputSchema.safeParse(businessInput(formData));
  if (!parsed.success) return failure(new ShipmentError("INVALID_SHIPMENT_INPUT"));
  try { await operation(parsed.data.shipmentId); }
  catch (error) { return failure(error); }
  revalidateDetails();
  return { status: "success", message };
}

export async function submitAdminShipShipmentAction(_previousState: AdminShipmentActionState, formData: FormData): Promise<AdminShipmentActionState> {
  await requireAdmin();
  return submitTransition(formData, markShipmentShippedAsAdmin, "物流已標記寄出。");
}

export async function submitAdminArriveShipmentAction(_previousState: AdminShipmentActionState, formData: FormData): Promise<AdminShipmentActionState> {
  await requireAdmin();
  return submitTransition(formData, markShipmentArrivedAsAdmin, "物流已標記到店。");
}

export async function submitAdminReturnShipmentAction(_previousState: AdminShipmentActionState, formData: FormData): Promise<AdminShipmentActionState> {
  await requireAdmin();
  return submitTransition(formData, markShipmentReturnedAsAdmin, "物流已記錄退回，未回補訂單庫存。");
}

export async function submitAdminVoidShipmentAction(_previousState: AdminShipmentActionState, formData: FormData): Promise<AdminShipmentActionState> {
  await requireAdmin();
  return submitTransition(formData, voidShipmentAsAdmin, "物流已記錄作廢。");
}
