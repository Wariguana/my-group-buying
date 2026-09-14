"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ORDER_ACCESS_COOKIE_NAME,
  orderAccessCookieOptions,
} from "@/lib/orders/access-cookie";
import {
  getOrderForAccess,
  ORDER_ACCESS_FAILURE_MESSAGE,
} from "@/lib/orders/access-service";
import type { OrderAccessActionState } from "./access-action-state";

function singleString(formData: FormData, name: string): string | null {
  const values = formData.getAll(name);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : null;
}

function accessFailure(): OrderAccessActionState {
  return { status: "error", message: ORDER_ACCESS_FAILURE_MESSAGE };
}

export async function submitOrderAccessAction(
  _previousState: OrderAccessActionState,
  formData: FormData,
): Promise<OrderAccessActionState> {
  const publicCode = singleString(formData, "publicCode");
  const managementCode = singleString(formData, "managementCode");
  const result = await getOrderForAccess(publicCode, managementCode);
  if (!result.ok || publicCode === null || managementCode === null) {
    return accessFailure();
  }

  try {
    const cookieStore = await cookies();
    cookieStore.set(
      ORDER_ACCESS_COOKIE_NAME,
      managementCode,
      orderAccessCookieOptions(publicCode),
    );
  } catch {
    return accessFailure();
  }

  redirect(`/orders/${publicCode}`);
}
