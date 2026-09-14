"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-admin";
import { PickupOrderError } from "@/lib/orders/pickup-errors";
import { markOrderPickedUpAsAdmin } from "@/lib/orders/pickup-service";
import { adminPickupOrderInputSchema } from "@/lib/orders/validation";
import type { AdminPickupOrderActionState } from "./pickup-action-state";

export async function submitAdminPickupOrderAction(
  _previousState: AdminPickupOrderActionState,
  formData: FormData,
): Promise<AdminPickupOrderActionState> {
  await requireAdmin();
  // Next.js transport metadata is not business input. Reject all other fields,
  // including duplicates, rather than silently accepting extra authority.
  const entries = [...formData.entries()].filter(([key]) => !key.startsWith("$ACTION_"));
  const parsed = adminPickupOrderInputSchema.safeParse(
    new Set(entries.map(([key]) => key)).size === entries.length
      ? Object.fromEntries(entries)
      : null,
  );
  if (!parsed.success) return { status: "error", message: "訂單資料無效。" };
  const { publicCode } = parsed.data;

  try {
    await markOrderPickedUpAsAdmin(publicCode);
  } catch (error) {
    if (error instanceof PickupOrderError) {
      if (error.code === "CANCELLED") return { status: "error", message: "已取消的訂單無法取貨。" };
      if (error.code === "ACCESS_DENIED") return { status: "error", message: "找不到訂單。" };
      if (error.code === "CONFLICT_RETRY_EXHAUSTED") {
        return { status: "error", message: "同時處理人數較多，請再試一次。" };
      }
    }
    return { status: "error", message: "標記已取貨失敗，請稍後再試。" };
  }

  for (const path of [
    `/admin/orders/${publicCode}`,
    "/admin/orders",
    `/orders/${publicCode}`,
  ]) {
    try {
      revalidatePath(path);
    } catch {
      // Already committed: cache failure must not turn success into a retry.
    }
  }
  return { status: "success", message: "訂單已取貨。" };
}
