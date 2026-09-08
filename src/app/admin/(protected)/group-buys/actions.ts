"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import {
  createGroupBuyDraft,
  updateGroupBuyDraft,
  type GroupBuyErrorCode,
} from "@/lib/group-buys/service";
import {
  createGroupBuyDraftSchema,
  updateGroupBuyDraftSchema,
} from "@/lib/group-buys/validation";

type GroupBuyField = "title" | "description" | "coverImageUrl" | "startAt" | "endAt" | "items" | "pickups";

export type GroupBuyFormState = {
  fieldErrors: Partial<Record<GroupBuyField, string[]>>;
  formError: string | null;
};

function formDataInput(formData: FormData): unknown {
  const entries = [...formData.entries()].filter(([key]) => !key.startsWith("$ACTION_"));
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return null;
  const raw = Object.fromEntries(entries);
  if (typeof raw.items !== "string" || typeof raw.pickups !== "string") return null;
  try {
    return { ...raw, items: JSON.parse(raw.items), pickups: JSON.parse(raw.pickups) };
  } catch {
    return null;
  }
}

function validationState(error: { flatten(): { fieldErrors: Record<string, string[]> } }): GroupBuyFormState {
  return { fieldErrors: error.flatten().fieldErrors, formError: "請修正標示的欄位。" };
}

function serviceFailure(error: GroupBuyErrorCode): GroupBuyFormState {
  if (error === "NOT_FOUND") return { fieldErrors: {}, formError: "找不到團購。" };
  if (error === "NOT_EDITABLE") return { fieldErrors: {}, formError: "此團購目前不可用草稿模式編輯。" };
  if (error === "PRODUCT_UNAVAILABLE") {
    return { fieldErrors: { items: ["所選商品不存在、已停用或不可再新增，請重新選擇。"] }, formError: "請修正標示的欄位。" };
  }
  if (error === "PICKUP_LOCATION_UNAVAILABLE") {
    return { fieldErrors: { pickups: ["所選取貨地點不存在、已停用或不可再新增，請重新選擇。"] }, formError: "請修正標示的欄位。" };
  }
  if (error === "INVALID_INPUT") return { fieldErrors: {}, formError: "輸入資料無效。" };
  return { fieldErrors: {}, formError: "儲存失敗，請稍後再試。" };
}

export async function createGroupBuyDraftAction(
  _previousState: GroupBuyFormState,
  formData: FormData,
): Promise<GroupBuyFormState> {
  await requireAdmin();
  const parsed = createGroupBuyDraftSchema.safeParse(formDataInput(formData));
  if (!parsed.success) return validationState(parsed.error);
  const result = await createGroupBuyDraft(parsed.data);
  if (!result.ok) return serviceFailure(result.error);
  revalidatePath("/admin/group-buys");
  redirect("/admin/group-buys");
}

export async function updateGroupBuyDraftAction(
  id: string,
  _previousState: GroupBuyFormState,
  formData: FormData,
): Promise<GroupBuyFormState> {
  await requireAdmin();
  const parsed = updateGroupBuyDraftSchema.safeParse(formDataInput(formData));
  if (!parsed.success) return validationState(parsed.error);
  const result = await updateGroupBuyDraft(id, parsed.data);
  if (!result.ok) return serviceFailure(result.error);
  revalidatePath("/admin/group-buys");
  redirect("/admin/group-buys");
}
