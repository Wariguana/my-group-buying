"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ORDER_ACCESS_COOKIE_NAME } from "@/lib/orders/access-cookie";
import { CancelOrderError, type CancelOrderErrorCode } from "@/lib/orders/cancel-errors";
import { cancelOrder } from "@/lib/orders/cancel-service";
import type { CancelOrderActionState } from "./cancel-action-state";

const messages: Record<CancelOrderErrorCode, string> = {
  ALREADY_PICKED_UP: "訂單已取貨，無法取消。",
  ALREADY_PAID: "訂單已確認收款，無法取消。",
  ACCESS_DENIED: "找不到訂單或訂單管理憑證無效。",
  CANCELLATION_CLOSED: "此團購已截止，訂單無法自行取消。",
  CONFLICT_RETRY_EXHAUSTED: "同時處理人數較多，請再試一次。",
  FAILED: "取消訂單失敗，請稍後再試。",
};

function singleString(formData: FormData, name: string): string | null {
  const values = formData.getAll(name);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : null;
}

function errorState(code: CancelOrderErrorCode): CancelOrderActionState {
  return { status: "error", message: messages[code] };
}

export async function submitCancelOrderAction(
  _previousState: CancelOrderActionState,
  formData: FormData,
): Promise<CancelOrderActionState> {
  const publicCode = singleString(formData, "publicCode");
  if (publicCode === null) return errorState("ACCESS_DENIED");

  let rawAccessToken: string | undefined;
  try {
    rawAccessToken = (await cookies()).get(ORDER_ACCESS_COOKIE_NAME)?.value;
  } catch {
    return errorState("FAILED");
  }

  try {
    await cancelOrder(publicCode, rawAccessToken);
  } catch (error) {
    return error instanceof CancelOrderError
      ? errorState(error.code)
      : errorState("FAILED");
  }

  try {
    revalidatePath(`/orders/${publicCode}`);
  } catch {
    // Cancellation has committed. Revalidation is best-effort and must not
    // turn a successful cancellation into a retryable-looking failure.
  }
  return { status: "success", message: "訂單已取消。" };
}
