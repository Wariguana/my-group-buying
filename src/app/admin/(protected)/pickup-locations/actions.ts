"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import {
  createPickupLocation,
  setPickupLocationActive,
  updatePickupLocation,
  type PickupLocationErrorCode,
} from "@/lib/pickup-locations/service";
import {
  createPickupLocationSchema,
  pickupLocationStatusMutationSchema,
  updatePickupLocationSchema,
} from "@/lib/pickup-locations/validation";

type PickupLocationField = "name" | "address" | "description";

export type PickupLocationFormState = {
  fieldErrors: Partial<Record<PickupLocationField, string[]>>;
  formError: string | null;
};

function formDataInput(formData: FormData): unknown {
  const entries = [...formData.entries()].filter(([key]) => !key.startsWith("$ACTION_"));
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return null;
  return Object.fromEntries(entries);
}

function validationState(error: { flatten(): { fieldErrors: Record<string, string[]> } }): PickupLocationFormState {
  return {
    fieldErrors: error.flatten().fieldErrors,
    formError: "請修正標示的欄位。",
  };
}

function serviceFailure(error: PickupLocationErrorCode): PickupLocationFormState {
  if (error === "NOT_FOUND") return { fieldErrors: {}, formError: "找不到取貨地點。" };
  if (error === "INVALID_INPUT") return { fieldErrors: {}, formError: "輸入資料無效。" };
  return { fieldErrors: {}, formError: "儲存失敗，請稍後再試。" };
}

export async function createPickupLocationAction(
  _previousState: PickupLocationFormState,
  formData: FormData,
): Promise<PickupLocationFormState> {
  await requireAdmin();
  const parsed = createPickupLocationSchema.safeParse(formDataInput(formData));
  if (!parsed.success) return validationState(parsed.error);

  const result = await createPickupLocation(parsed.data);
  if (!result.ok) return serviceFailure(result.error);

  revalidatePath("/admin/pickup-locations");
  redirect("/admin/pickup-locations");
}

export async function updatePickupLocationAction(
  id: string,
  _previousState: PickupLocationFormState,
  formData: FormData,
): Promise<PickupLocationFormState> {
  await requireAdmin();
  const parsed = updatePickupLocationSchema.safeParse(formDataInput(formData));
  if (!parsed.success) return validationState(parsed.error);

  const result = await updatePickupLocation(id, parsed.data);
  if (!result.ok) return serviceFailure(result.error);

  revalidatePath("/admin/pickup-locations");
  redirect("/admin/pickup-locations");
}

async function setPickupLocationStatusAction(id: string, isActive: boolean): Promise<void> {
  await requireAdmin();
  const parsed = pickupLocationStatusMutationSchema.safeParse({ id, isActive });
  if (!parsed.success) redirect("/admin/pickup-locations?error=not-found");

  const result = await setPickupLocationActive(parsed.data.id, parsed.data.isActive);
  if (!result.ok) {
    const error = result.error === "FAILED" ? "failed" : "not-found";
    redirect(`/admin/pickup-locations?error=${error}`);
  }

  revalidatePath("/admin/pickup-locations");
  redirect("/admin/pickup-locations");
}

export async function deactivatePickupLocationAction(id: string): Promise<void> {
  return setPickupLocationStatusAction(id, false);
}

export async function reactivatePickupLocationAction(id: string): Promise<void> {
  return setPickupLocationStatusAction(id, true);
}
