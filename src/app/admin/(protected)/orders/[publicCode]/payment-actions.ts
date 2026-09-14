"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-admin";
import { PaymentOrderError } from "@/lib/orders/payment-errors";
import { markOrderPaidAsAdmin } from "@/lib/orders/payment-service";
import { adminPaymentOrderInputSchema } from "@/lib/orders/validation";
import type { AdminPaymentOrderActionState } from "./payment-action-state";

export async function submitAdminPaymentOrderAction(
  _previousState: AdminPaymentOrderActionState,
  formData: FormData,
): Promise<AdminPaymentOrderActionState> {
  await requireAdmin();
  // Next.js transport metadata is not business input. Reject all other fields,
  // including duplicates, rather than silently accepting extra authority.
  const entries = [...formData.entries()].filter(([key]) => !key.startsWith("$ACTION_"));
  const parsed = adminPaymentOrderInputSchema.safeParse(
    new Set(entries.map(([key]) => key)).size === entries.length
      ? Object.fromEntries(entries)
      : null,
  );
  if (!parsed.success) return { status: "error", message: "訂單資料無效。" };
  const { publicCode } = parsed.data;

  try {
    await markOrderPaidAsAdmin(publicCode);
  } catch (error) {
    if (error instanceof PaymentOrderError) {
      if (error.code === "CANCELLED") return { status: "error", message: "已取消的訂單無法確認收款。" };
      if (error.code === "ACCESS_DENIED") return { status: "error", message: "找不到訂單。" };
      if (error.code === "CONFLICT_RETRY_EXHAUSTED") {
        return { status: "error", message: "同時處理人數較多，請再試一次。" };
      }
    }
    return { status: "error", message: "確認收款失敗，請稍後再試。" };
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
  return { status: "success", message: "訂單已確認收款。" };
}
