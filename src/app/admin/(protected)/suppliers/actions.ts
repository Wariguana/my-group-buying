"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import {
  createSupplier,
  setSupplierActive,
  updateSupplier,
} from "@/lib/suppliers/service";
import {
  createSupplierSchema,
  supplierStatusMutationSchema,
  updateSupplierSchema,
} from "@/lib/suppliers/validation";

type SupplierField = "name" | "contactName" | "phone" | "lineContact" | "note";

export type SupplierFormState = {
  fieldErrors: Partial<Record<SupplierField, string[]>>;
  formError: string | null;
};

function formDataInput(formData: FormData): unknown {
  const entries = [...formData.entries()].filter(([key]) => !key.startsWith("$ACTION_"));
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return null;
  return Object.fromEntries(entries);
}

function validationState(error: { flatten(): { fieldErrors: Record<string, string[]> } }): SupplierFormState {
  return {
    fieldErrors: error.flatten().fieldErrors,
    formError: "請修正標示的欄位。",
  };
}

function serviceFailure(error: "INVALID_INPUT" | "NOT_FOUND" | "FAILED"): SupplierFormState {
  if (error === "NOT_FOUND") return { fieldErrors: {}, formError: "找不到供應商。" };
  if (error === "INVALID_INPUT") return { fieldErrors: {}, formError: "輸入資料無效。" };
  return { fieldErrors: {}, formError: "儲存失敗，請稍後再試。" };
}

export async function createSupplierAction(
  _previousState: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  await requireAdmin();
  const parsed = createSupplierSchema.safeParse(formDataInput(formData));
  if (!parsed.success) return validationState(parsed.error);

  const result = await createSupplier(parsed.data);
  if (!result.ok) return serviceFailure(result.error);

  revalidatePath("/admin/suppliers");
  redirect("/admin/suppliers");
}

export async function updateSupplierAction(
  id: string,
  _previousState: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  await requireAdmin();
  const parsed = updateSupplierSchema.safeParse(formDataInput(formData));
  if (!parsed.success) return validationState(parsed.error);

  const result = await updateSupplier(id, parsed.data);
  if (!result.ok) return serviceFailure(result.error);

  revalidatePath("/admin/suppliers");
  redirect("/admin/suppliers");
}

async function setSupplierStatusAction(id: string, isActive: boolean): Promise<void> {
  await requireAdmin();
  const parsed = supplierStatusMutationSchema.safeParse({ id, isActive });
  if (!parsed.success) redirect("/admin/suppliers?error=not-found");

  const result = await setSupplierActive(parsed.data.id, parsed.data.isActive);
  if (!result.ok) {
    const error = result.error === "FAILED" ? "failed" : "not-found";
    redirect(`/admin/suppliers?error=${error}`);
  }

  revalidatePath("/admin/suppliers");
  redirect("/admin/suppliers");
}

export async function deactivateSupplierAction(id: string): Promise<void> {
  return setSupplierStatusAction(id, false);
}

export async function reactivateSupplierAction(id: string): Promise<void> {
  return setSupplierStatusAction(id, true);
}
