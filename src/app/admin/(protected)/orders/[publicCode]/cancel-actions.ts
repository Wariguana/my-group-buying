"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-admin";
import { CancelOrderError } from "@/lib/orders/cancel-errors";
import { cancelOrderAsAdmin } from "@/lib/orders/cancel-service";
import { adminCancelOrderInputSchema } from "@/lib/orders/validation";
import type { AdminCancelOrderActionState } from "./cancel-action-state";

export async function submitAdminCancelOrderAction(
  _previousState: AdminCancelOrderActionState,
  formData: FormData,
): Promise<AdminCancelOrderActionState> {
  await requireAdmin();
  // Next.js transport metadata is not business input. Reject all other fields,
  // including duplicates, rather than silently accepting extra authority.
  const entries = [...formData.entries()].filter(([key]) => !key.startsWith("$ACTION_"));
  const parsed = adminCancelOrderInputSchema.safeParse(
    new Set(entries.map(([key]) => key)).size === entries.length
      ? Object.fromEntries(entries)
      : null,
  );
  if (!parsed.success) return { status: "error", message: "訂單資料無效。" };
  const { publicCode } = parsed.data;

  try {
    await cancelOrderAsAdmin(publicCode);
  } catch (error) {
    if (error instanceof CancelOrderError) {
      if (error.code === "ACCESS_DENIED") return { status: "error", message: "找不到訂單。" };
      if (error.code === "CONFLICT_RETRY_EXHAUSTED") {
        return { status: "error", message: "同時處理人數較多，請再試一次。" };
      }
    }
    return { status: "error", message: "取消訂單失敗，請稍後再試。" };
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
  return { status: "success", message: "訂單已取消。" };
}
